const express = require('express');
const axios = require('axios');
const app = express();

// السماح بأحجام ملفات كبيرة جداً
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ⚠️ ضع مفتاح Gemini API الجديد الخاص بك هنا
const GEMINI_API_KEY = "AIzaSyCvKl4GgETH480jHRE4BYCVb-1g3zQELJE";

app.post('/ask-bot', async (req, res) => {
    try {
        const { medicineDb, userQuery } = req.body;

        if (!medicineDb || !userQuery) {
            return res.status(400).json({ error: "البيانات المرسلة ناقصة" });
        }

        // رابط استدعاء نموذج Gemini 1.5 Flash الرسمي
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        // إعداد هيكلية البيانات (Payload) حسب توثيق جوجل الرسمي
        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `أنت مساعد طبي خبير ومخصص للإجابة عن أسئلة الأدوية بالاعتماد الحصري والصارم على سياق قاعدة المعرفة المرفقة أدناه فقط.
                            
                            الشروط والقيود الصارمة:
                            1. أجب عن أسئلة المستخدم بدقة وبناءً على النص الموجود في قاعدة المعرفة أدناه فقط باللغة العربية الطبيعية.
                            2. إذا لم تجد الدواء أو المعلومة المطلوبة داخل النص المرفق، يجب أن تجيب حرفياً بهاتين الكلمتين فقط دون أي زيادة أو شرح أو تخمين: "لا أعرف".
                            3. يمنع منعاً باتاً اختراع جرعات طبية خارج هذا المستند.

                            إليك قاعدة المعرفة الكاملة للأدوية:\n${medicineDb}`
                        },
                        {
                            text: `سؤال المستخدم: ${userQuery}`
                        }
                    ]
                }
            ],
            generationConfig: {
                temperature: 0.0 // الالتزام الحرفي بالملف ومنع التخمين
            }
        };

        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' }
        });

        // استخراج الإجابة النصية من رد جوجل المعقد
        const reply = response.data.contents[0].parts[0].text;
        res.json({ answer: reply });

    } catch (error) {
        console.error("❌ Gemini API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال بجوجل" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Gemini Proxy server running on port ${PORT}`));
