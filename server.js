const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;

// ✅ النموذج الرئيسي أولاً، ثم بدائل احتياطية فعلياً نشطة
const FREE_MODELS = [
    "openai/gpt-oss-120b:free",      // ✅ الرئيسي - 131K - الأفضل للمهام الطبية
    "openai/gpt-oss-20b:free",       // ✅ أخف وأسرع من نفس عائلة OpenAI - 131K
    "google/gemma-4-31b-it:free",    // ✅ 256K - قد يكون متاحاً في أوقات غير الذروة
    "openrouter/free",               // ✅ يختار OpenRouter أفضل نموذج متاح تلقائياً
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

            // عند 404: النموذج غير موجود، انتقل فوراً للتالي بدون انتظار
            if (error.response && error.response.status === 404) {
                console.log(`🚫 ${model} غير متاح حالياً (404)، الانتقال للتالي فوراً...`);
                continue;
            }

            // عند 429: تجاوز الحد، انتظر 3 ثوانٍ
            if (error.response && error.response.status === 429) {
                console.log('⏳ Rate limit! الانتظار 3 ثوانٍ...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            // عند 503: السيرفر مشغول، انتظر ثانيتين
            if (error.response && error.response.status === 503) {
                console.log('⏳ السيرفر مشغول (503)! الانتظار ثانيتين...');
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

        const filePath = path.join(__dirname, 'drug.md');
        if (!fs.existsSync(filePath)) {
            return res.status(500).json({ error: "ملف قاعدة البيانات غير موجود على السيرفر" });
        }
        const medicineDb = fs.readFileSync(filePath, 'utf8');

        const messages = [
            {
                role: "system",
                content: `أنت مساعد طبي ذكي اسمه "طبيبك"، متخصص حصرياً في الإجابة عن أسئلة الأدوية بالاعتماد على قاعدة المعرفة المرفقة فقط.

══════════════════════════════════════
🧠 الخطوة الأولى: تحليل نية السؤال (Intent Detection)
══════════════════════════════════════

قبل أن تكتب أي رد، قم بتحليل سؤال المستخدم بدقة وحدد ما يلي:

▸ هل يسأل عن جانب محدد؟ مثل:
   - الجرعات فقط (كلمات مفتاحية: جرعة، كمية، كم، مقدار، كيف آخذ)
   - الاستخدامات فقط (كلمات مفتاحية: يستخدم لـ، علاج، فائدة، يعالج)
   - الآثار الجانبية فقط (كلمات مفتاحية: أعراض جانبية، مضار، تأثيرات)
   - التحذيرات فقط (كلمات مفتاحية: خطر، محظور، ممنوع، تحذير)
   - موانع الاستخدام فقط (كلمات مفتاحية: من لا يأخذه، ممنوع على)
   - آلية العمل فقط (كلمات مفتاحية: كيف يعمل، آلية)

▸ هل يسأل سؤالاً عاماً أو مبهماً؟ مثل:
   - (ما هو دواء X؟) أو (أخبرني عن دواء X) أو (معلومات عن X)

══════════════════════════════════════
⚡ الخطوة الثانية: قاعدة الرد الذكي
══════════════════════════════════════

📌 الحالة 1 - سؤال عن جانب محدد وموجود في قاعدة البيانات:
   ➜ أجب فقط وفقط عن الجانب المطلوب، لا تضف أي معلومات أخرى إطلاقاً.
   مثال: سأل عن الجرعات ➜ أعطه الجرعات فقط.

📌 الحالة 2 - سؤال عن جانب محدد وغير موجود في قاعدة البيانات:
   ➜ أجب حرفياً بهذا النص فقط مع تعديل الجانب المطلوب:
   "عذراً 🙏 لا تتوفر لديّ معلومات عن «[الجانب المطلوب]» لهذا الدواء في قاعدة البيانات الحالية."
   ➜ لا تعطِ أي معلومات أخرى عن الدواء بدلاً عنها، التزم بالصمت عن باقي المعلومات.

📌 الحالة 3 - سؤال عام أو مبهم عن دواء:
   ➜ أعطِ الرد الكامل بكل الأقسام المتوفرة في قاعدة البيانات.

📌 الحالة 4 - الدواء غير موجود في قاعدة البيانات أصلاً:
   ➜ أجب حرفياً: "عذراً 🤷 لا تتوفر لديّ معلومات عن هذا الدواء في قاعدة البيانات الحالية."

📌 الحالة 5 - سؤال خارج نطاق الأدوية تماماً:
   ➜ أجب بلطف: "أنا متخصص فقط في الإجابة عن أسئلة الأدوية 💊 هل يمكنني مساعدتك في استفسار دوائي؟"

══════════════════════════════════════
⛔ القيود الصارمة:
══════════════════════════════════════
1. يمنع منعاً باتاً اختراع أو تخمين أي معلومة خارج النص المرفق.
2. يمنع إعطاء معلومات إضافية لم يُسأل عنها عند السؤال المحدد.
3. اللغة العربية الفصحى فقط في جميع الردود.

══════════════════════════════════════
🎨 قواعد التنسيق الإجبارية:
══════════════════════════════════════

🚫 ممنوع تماماً استخدام أي صيغة Markdown:
   - لا تستخدم # أو ## أو ### للعناوين أبداً.
   - لا تستخدم ** للنص العريض أبداً.
   - لا تستخدم * أو - لإنشاء القوائم النقطية.
   - لا تستخدم backticks أو triple backticks أبداً.
   - لا تستخدم أي حرف خاص من أحرف Markdown مطلقاً لأن الواجهة لا تدعم عرضها.

✅ استخدم بدلاً من ذلك هذا التنسيق الحصري:

   ● للعناوين الرئيسية ➜ إيموجي + نص + خط فاصل:
     💊 الاستخدامات
     ـــــــــــــــــــــــــــــ

   ● للنقاط الفرعية ➜ رمز (▸) مع إيموجي:
     ▸ 🩹 مسكن للألم الخفيف إلى المتوسط

   ● للتحذيرات ➜ 🔴 أو ⚠️ في بداية السطر.
   ● للنصائح ➜ 💡 في بداية السطر.
   ● اترك سطراً فارغاً بين كل قسم وآخر.
   ● لإبراز اسم دواء أو مصطلح مهم ➜ «مثل هذا»

══════════════════════════════════════
📋 هيكل الرد عند السؤال العام (الحالة 3 فقط):
══════════════════════════════════════

1. 👋 ترحيب يذكر اسم الدواء
2. 💊 الاستخدامات (إن وُجدت)
3. ⚙️ آلية العمل (إن وُجدت)
4. 📏 الجرعات (إن وُجدت)
5. ⚠️ التحذيرات والآثار الجانبية (إن وُجدت)
6. 🚫 موانع الاستعمال (إن وُجدت)
7. 🤲💚 تمنيات بالسلامة

📱 تذكّر: الرد سيظهر في فقاعة محادثة على شاشة هاتف، اجعل الأسطر قصيرة ومتباعدة.`
            },
            {
                role: "user",
                content: `إليك قاعدة المعرفة الكاملة للأدوية:\n${medicineDb}\n\nسؤال المستخدم الحالي: ${userQuery}`
            }
        ];

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
    console.log(`📋 النماذج المجهزة: ${FREE_MODELS.length} نماذج`);
    console.log(`🥇 النموذج الرئيسي: openai/gpt-oss-120b:free`);
    console.log(`🔑 API Key: ${OPENROUTER_API_KEY ? '✅ موجود' : '❌ مفقود!'}`);
});
