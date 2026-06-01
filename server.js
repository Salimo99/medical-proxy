const express = require('express');
const axios = require('axios');
const app = express();

// السماح باستيعاب قاعدة البيانات الضخمة في الـ body
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ⚠️ ضع مفتاح Gemini API الحقيقي الخاص بك هنا
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/ask-bot', async (req, res) => {
    try {
        const { medicineDb, userQuery } = req.body;

        if (!medicineDb || !userQuery) {
            return res.status(400).json({ error: "البيانات المرسلة ناقصة" });
        }

        // الرابط الرسمي المعتمد والمثبت في توثيق جوجل الحالي
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        const requestBody = {
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            text: `أنت مساعد طبي خبير ومخصص للإجابة عن أسئلة الأدوية بالاعتماد الحصري والصارم على سياق قاعدة المعرفة المرفقة أدناه فقط.
                            
                            الشروط والقيود الصارمة:
                            1. أجب عن أسئلة المستخدم بدقة وبناءً على النص الموجود في قاعدة المعرفة أدناه فقط باللغة العربية.
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
                temperature: 0.0
            }
        };

        const response = await axios.post(url, requestBody, {
            headers: { 'Content-Type': 'application/json' }
        });

        // التحقق من الهيكل الرسمي واستخراج النص المسترجع بأمان
        if (response.data && response.data.candidates && response.data.candidates[0].content.parts[0].text) {
            const reply = response.data.candidates[0].content.parts[0].text;
            res.json({ answer: reply });
        } else {
            console.error("⚠️ هيكل استجابة غير متوقع:", JSON.stringify(response.data));
            res.status(500).json({ error: "استجابة جوجل غير متوقعة الهيكل" });
        }

    } catch (error) {
        // طباعة تفاصيل الخطأ بدقة في سجلات Render
        console.error("❌ Gemini API Error Details:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: "حدث خطأ أثناء الاتصال بجوجل",
            details: error.response ? error.response.data : error.message 
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Gemini 2.5 Proxy server running on port ${PORT}`));
