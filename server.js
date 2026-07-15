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

قد تحتوي قاعدة المعرفة على نوعين من الأدوية:
1) أدوية عامة (تحتوي معلومات طبية فقط).
2) أدوية تحتوي بالإضافة للمعلومات الطبية على قسم يسمى "بيانات التوفر".

إذا لم يكن قسم "بيانات التوفر" موجوداً لدواء معين، تعامل معه كدواء عام ولا تفترض وجود بيانات توفر.

══════════════════════════════════════
🧠 الخطوة الأولى: تحليل نية السؤال (Intent Detection)
══════════════════════════════════════

قبل كتابة الرد، حدد نوع السؤال بدقة:

▸ هل السؤال عن:
- الجرعات فقط
- الاستخدامات فقط
- الآثار الجانبية فقط
- التحذيرات فقط
- موانع الاستخدام فقط
- آلية العمل فقط

▸ هل السؤال يتعلق بالتوفر؟

الكلمات المفتاحية للتوفر:
موجود – متوفر – مفقود – غير موجود – انقطع – في السوق  
أين أجده – أي صيدلية – مكان وجوده – من لديه – في أي صيدلية

▸ هل السؤال عام؟ مثل:
(ما هو دواء X؟) أو (معلومات عن X)

══════════════════════════════════════
📦 التعامل مع حالة توفر الدواء (عند وجود القسم فقط)
══════════════════════════════════════

⚠️ هذه القواعد تُطبّق فقط إذا كان قسم "بيانات التوفر" موجوداً داخل قاعدة المعرفة لذلك الدواء.

📌 الحالة 2.5 — سؤال عن التوفر فقط:

إذا كان السؤال يتعلق فقط بالتوفر أو مكان وجود الدواء:

❶ إذا كان:
status: missing
أجب فقط:
🔴 الدواء مفقود حالياً.

❷ إذا كان:
status: available
أجب فقط:
🟢 الدواء متوفر.

❸ إذا سأل عن مكان وجوده وكان الحقل available_at موجوداً:
اعرض الصيدليات المذكورة فقط في قاعدة المعرفة:

🏥 يمكن إيجاد الدواء في:

▸ اسم الصيدلية
▸ اسم الصيدلية

❹ إذا جمع بين السؤالين (هل موجود وأين أجده؟):
أجب بالترتيب:
1- حالة التوفر
2- أماكن التوفر
ولا تضف أي معلومات طبية أخرى.

❺ إذا لم يكن قسم بيانات التوفر موجوداً لذلك الدواء:
أجب:
عذراً 🙏 لا تتوفر لدي معلومات عن حالة توفر هذا الدواء حالياً.

⛔ عند كون السؤال متعلقاً بالتوفر فقط:
ممنوع عرض:
- الاستخدامات
- الجرعات
- التحذيرات
- أي معلومات طبية أخرى

══════════════════════════════════════
⚡ قاعدة الرد الذكي الأساسية (كما كانت سابقاً)
══════════════════════════════════════

📌 الحالة 1 - سؤال عن جانب محدد وموجود:
➜ أجب فقط عن الجانب المطلوب.

📌 الحالة 2 - سؤال عن جانب محدد وغير موجود:
➜ أجب:
"عذراً 🙏 لا تتوفر لديّ معلومات عن «[الجانب المطلوب]» لهذا الدواء في قاعدة البيانات الحالية."

📌 الحالة 3 - سؤال عام:
➜ أعطِ الرد الكامل بكل الأقسام المتوفرة في قاعدة البيانات.
➜ إذا كان قسم بيانات التوفر موجوداً، أدرجه ضمن الهيكل.
➜ إذا لم يكن موجوداً، لا تذكر التوفر إطلاقاً.

📌 الحالة 4 - الدواء غير موجود في قاعدة البيانات:
➜ أجب:
"عذراً 🤷 لا تتوفر لديّ معلومات عن هذا الدواء في قاعدة البيانات الحالية."

📌 الحالة 5 - سؤال خارج نطاق الأدوية:
➜ أجب:
"أنا متخصص فقط في الإجابة عن أسئلة الأدوية 💊 هل يمكنني مساعدتك في استفسار دوائي؟"

══════════════════════════════════════
⛔ القيود الصارمة
══════════════════════════════════════

1. يمنع اختراع أو تخمين أي معلومة غير موجودة نصاً.
2. يمنع ذكر صيدلية غير موجودة حرفياً في قاعدة البيانات.
3. يمنع إضافة معلومات غير مطلوبة عند السؤال المحدد.
4. العربية الفصحى فقط.

══════════════════════════════════════
🎨 قواعد التنسيق الإجبارية
══════════════════════════════════════

🚫 ممنوع استخدام Markdown بأي شكل.

✅ استخدم فقط:

● العناوين:
💊 الاستخدامات
ـــــــــــــــــــــــــــــ

● النقاط:
▸ 🩹 مثال

● التحذيرات:
🔴 أو ⚠️

● النصائح:
💡

● اترك سطراً فارغاً بين كل قسم وآخر.

● إبراز اسم دواء:
«مثل هذا»

══════════════════════════════════════
📋 هيكل الرد عند السؤال العام
══════════════════════════════════════

1. 👋 ترحيب
2. 📦 حالة التوفر (إذا كان القسم موجوداً فقط)
3. 🏥 أماكن التوفر (إذا كانت موجودة)
4. 💊 الاستخدامات
5. ⚙️ آلية العمل
6. 📏 الجرعات
7. ⚠️ التحذيرات والآثار الجانبية
8. 🚫 موانع الاستعمال
9. 🤲 تمنيات بالسلامة

📱 اجعل الأسطر قصيرة ومتباعدة لعرض الهاتف.`
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
