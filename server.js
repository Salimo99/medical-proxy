const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// قراءة مفتاح OpenRouter من متغيرات البيئة
const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;

// ✅ قائمة النماذج المجانية مرتبة حسب الأفضلية
const FREE_MODELS = [
    "google/gemma-4-31b-it:free",
    "meta-llama/llama-4-scout:free",
    "meta-llama/llama-4-maverick:free",
    "deepseek/deepseek-r1:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "openai/gpt-oss-120b:free",
];

// ─── دالة الإرسال مع Fallback تلقائي ───
async function callWithFallback(messages) {
    for (let i = 0; i < FREE_MODELS.length; i++) {
        const model = FREE_MODELS[i];
        try {
            console.log(`🔄 محاولة #${i + 1}: جاري الاتصال بـ ${model}...`);

            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: model,
                    messages: messages,
                    temperature: 0.3
                },
                {
                    headers: {
                        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://my-medical-proxy-api.onrender.com',
                        'X-Title': 'Medical Graduation Application'
                    },
                    timeout: 120000
                }
            );

            if (
                response.data &&
                response.data.choices &&
                response.data.choices[0] &&
                response.data.choices[0].message &&
                response.data.choices[0].message.content
            ) {
                console.log(`✅ نجح الاتصال بـ ${model}`);
                return {
                    answer: response.data.choices[0].message.content,
                    model_used: model
                };
            } else {
                console.warn(`⚠️ ${model} أرجع استجابة فارغة، جاري تجربة النموذج التالي...`);
            }

        } catch (error) {
            const status = error.response ? error.response.status : 'TIMEOUT';
            const errMsg = error.response ? JSON.stringify(error.response.data) : error.message;
            console.error(`❌ فشل ${model} (${status}): ${errMsg}`);

            if (error.response && error.response.status === 429) {
                console.log('⏳ Rate limit! الانتظار ثانيتين...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    return null;
}

// ─── نقطة النهاية الرئيسية ───
app.post('/ask-bot', async (req, res) => {
    try {
        const { userQuery } = req.body;

        if (!userQuery) {
            return res.status(400).json({ error: "سؤال المستخدم مطلوب" });
        }

        // قراءة ملف الأدوية محلياً من السيرفر
        const filePath = path.join(__dirname, 'drug.md');
        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ error: "ملف قاعدة البيانات غير موجود على السيرفر" });
        }
        const medicineDb = fs.readFileSync(filePath, 'utf8');

        const messages = [
            {
                role: "system",
                content: `أنت مساعد طبي ذكي اسمه "طبيبك"، خبير ومحترف، ومخصص للإجابة عن أسئلة الأدوية بالاعتماد الحصري والصارم على سياق قاعدة المعرفة المرفقة أدناه فقط.

══════════════════════
⛔ الشروط والقيود الصارمة:
══════════════════════
1. أجب عن أسئلة المستخدم بدقة وبناءً على النص الموجود في قاعدة المعرفة أدناه فقط باللغة العربية الفصحى.
2. إذا لم تجد الدواء أو المعلومة المطلوبة داخل النص المرفق، يجب أن تجيب حرفياً: "عذراً، لا تتوفر لديّ معلومات عن هذا الدواء في قاعدة البيانات الحالية 🤷‍♂️"
3. يمنع منعاً باتاً اختراع أو تخمين جرعات طبية خارج هذا المستند.

══════════════════════════════════
🎨 قواعد التنسيق الإجبارية (التزم بها حرفياً):
══════════════════════════════════

🚫 ممنوع تماماً استخدام أي صيغة Markdown:
   - لا تستخدم # أو ## أو ### للعناوين أبداً.
   - لا تستخدم ** للنص العريض أبداً.
   - لا تستخدم * أو - لإنشاء القوائم النقطية.
   - لا تستخدم backticks أو triple backticks للأكواد أبداً.
   - لا تستخدم أي حرف خاص من أحرف Markdown مطلقاً لأن الواجهة لا تدعم عرضها.

✅ استخدم بدلاً من ذلك هذا التنسيق الحصري:

   ● للعناوين الرئيسية ➜ استخدم إيموجي + نص + خط فاصل تحته. مثال:
     💊 الاستخدامات
     ـــــــــــــــــــــــــــــ

   ● للنقاط الفرعية ➜ استخدم رموز مثل (▸) أو (•) أو أرقام مع إيموجي. مثال:
     ▸ 🩹 مسكن للألم الخفيف إلى المتوسط
     ▸ 🌡️ خافض للحرارة

   ● للتحذيرات ➜ استخدم 🔴 أو ⚠️ في بداية السطر.

   ● للنصائح ➜ استخدم 💡 في بداية السطر.

   ● اترك سطراً فارغاً واحداً بين كل قسم وآخر لتسهيل القراءة.

   ● لإبراز اسم الدواء أو مصطلح مهم ➜ ضعه بين علامتي تنصيص عربيتين: «مثل هذا»


📋 هيكل الرد المطلوب (اتبعه بالترتيب):

1. ابدأ بترحيب لطيف يذكر اسم الدواء مع إيموجي 👋

2. قسم «الاستخدامات» مع إيموجي 💊

3. قسم «آلية العمل» مع إيموجي ⚙️ (إن وُجد)

4. قسم «الجرعات» مع إيموجي 📏 (إن وُجد)

5. قسم «التحذيرات والآثار الجانبية» مع إيموجي ⚠️ (إن وُجد)

6. قسم «موانع الاستعمال» مع إيموجي 🚫 (إن وُجد)

7. اختم دائماً بدعاء أو تمنيات بالسلامة مع إيموجي 🤲💚

📱 تذكّر: الرد سيظهر في شاشة هاتف محمول داخل فقاعة محادثة (Chat Bubble)، لذا اجعل الأسطر قصيرة ومتباعدة ومريحة للعين.`
            },
            {
                role: "user",
                content: `إليك قاعدة المعرفة الكاملة للأدوية:\n${medicineDb}\n\nسؤال المستخدم الحالي: ${userQuery}`
            }
        ];

        // استدعاء النموذج مع Fallback تلقائي
        const result = await callWithFallback(messages);

        if (result) {
            res.json({
                answer: result.answer,
                model_used: result.model_used
            });
        } else {
            res.status(503).json({
                error: "جميع النماذج المجانية غير متاحة حالياً. يرجى المحاولة بعد دقائق.",
            });
        }

    } catch (error) {
        console.error("❌ Server Error:", error.message);
        res.status(500).json({
            error: "حدث خطأ داخلي في السيرفر",
            details: error.message
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Medical API Server running on port ${PORT}`);
    console.log(`📋 النماذج المجهزة: ${FREE_MODELS.length} نموذج مجاني`);
    console.log(`🔑 API Key: ${OPENROUTER_API_KEY ? '✅ موجود' : '❌ مفقود!'}`);
});
