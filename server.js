const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ⚠️ ضع مفتاح Gemini API الحقيقي الخاص بك هنا
const GEMINI_API_KEY = "AIzaSyCvKl4GgETH480jHRE4BYCVb-1g3zQELJE";

app.post('/ask-bot', async (req, res) => {
    try {
        const { medicineDb, userQuery } = req.body;

        if (!medicineDb || !userQuery) {
            return res.status(400).json({ error: "البيانات المرسلة ناقصة" });
        }

        // الرابط الرسمي المستقر والمعتمد 100%
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `أنت مساعد طبي خبير ومخصص للإجابة عن أسئلة الأدوية بالاعتماد الحصري والصارم على سياق قاعدة المعرفة المرفقة أدناه فقط.
                            
                            الشروط والقيود الصارمة:
                            1. أجب عن أسئلة المستخدم بدقة وبناءً على النص الموجود في قاعدة المعرفة أدناه فقط باللغة العربية.
                            2. إذا لم تجد الدواء أو المعلومة المطلوبة داخل النص المرفق، يجب أن تجيب حرفياً بهاتين الكلمتين فقط دون أي زيادة أو شرح: "لا أعرف".
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
                temperature: 0.0
            }
        };

        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' }
        });

        // قراءة الرد بحسب الهيكلية المستقرة لـ v1
        if (response.data.candidates && response.data.candidates[0].content.parts[0].text) {
            const reply = response.data.candidates[0].content.parts[0].text;
            res.json({ answer: reply });
        } else {
            res.status(500).json({ error: "استجابة جوجل غير متوقعة الهيكل" });
        }

    } catch (error) {
        console.error("❌ Gemini API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "حدث خطأ أثناء الاتصال بجوجل",
            details: error.response ? error.response.data : error.message 
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Gemini Proxy server running on port ${PORT}`));
