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
// إذا فشل الأول، يجرب الثاني تلقائياً، وهكذا...
const FREE_MODELS = [
    "google/gemma-4-31b-it:free",            // 256K سياق - ممتاز للعربية والمهام الطبية
    "meta-llama/llama-4-scout:free",          // 512K سياق - سريع ودقيق
    "meta-llama/llama-4-maverick:free",       // 1M سياق - الأكبر سياقاً
    "deepseek/deepseek-r1:free",              // 163K سياق - استدلالي قوي جداً
    "mistralai/mistral-small-3.1-24b-instruct:free", // 128K سياق - خفيف وسريع
    "openai/gpt-oss-120b:free",              // 131K سياق - مستقر
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
                    timeout: 120000 // دقيقتان مهلة (الملف كبير 55K توكن)
                }
            );

            // التحقق من أن الرد يحتوي على محتوى فعلي
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

            // إذا كان الخطأ 429 (تجاوز الحد)، انتظر ثانيتين ثم جرب التالي
            if (error.response && error.response.status === 429) {
                console.log('⏳ Rate limit! الانتظار ثانيتين...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    // إذا فشلت كل النماذج
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
                content: `أنت مساعد طبي ذكي، خبير ومحترف، ومخصص للإجابة عن أسئلة الأدوية بالاعتماد الحصري والصارم على سياق قاعدة المعرفة المرفقة أدناه فقط.
                    
الشروط والقيود الصارمة:
1. أجب عن أسئلة المستخدم بدقة وبناءً على النص الموجود في قاعدة المعرفة أدناه فقط باللغة العربية الفصحى.
2. إذا لم تجد الدواء أو المعلومة المطلوبة داخل النص المرفق، يجب أن تجيب حرفياً بهاتين الكلمتين فقط دون أي زيادة أو شرح أو تخمين: "لا أعرف".
3. يمنع منعاً باتاً اختراع أو تخمين جرعات طبية خارج هذا المستند.

💡 قواعد تنسيق وصياغة الرد (هامة جداً للمظهر):
- لا تقم بنسخ عناوين ملف الـ Markdown (مثل ## الأسماء التجارية) بشكلها الجاف.
- صغ الإجابة بأسلوب سردي طبيعي، منظم ومريح للقراءة، واستخدم الرموز التعبيرية (Emojis) المناسبة لكل قسم لتجعل الواجهة حيوية.
- نسق الإجابة على شكل نقاط واضحة ومتباعدة باستخدام النجمة (*) أو الأرقام لتبدو ممتازة في شاشة الهاتف.
- ابدأ الرد بترحيب طبي لطيف يذكر اسم الدواء، واختم الرد بعبارة تمنيات بالسلامة.`
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
                model_used: result.model_used // مفيد لك في التطوير لمعرفة أي نموذج أجاب
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
