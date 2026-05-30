const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// مفتاح Groq الخاص بك يكون آمناً هنا داخل السيرفر
const GROQ_API_KEY = "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";

app.post('/ask-bot', async (req, res) => {
    try {
        // استقبال نص ملف الأدوية وسؤال المستخدم القادمين من تطبيق الفلاتر
        const { medicineDb, userQuery } = req.body;

        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: "llama-3.3-70b-versatile",
            messages: [
                {
                    role: "system",
                    content: `أنت مساعد طبي خبير ومخصص للإجابة عن أسئلة الأدوية بالاعتماد الحصري والصارم على سياق قاعدة المعرفة المرفقة أدناه فقط.
                    الشروط والقيود الصارمة:
                    1. أجب عن أسئلة المستخدم بدقة وبناءً على النص الموجود في قاعدة المعرفة أدناه فقط باللغة العربية.
                    2. إذا لم تجد الدواء أو المعلومة أجب حرفياً بـ "لا أعرف" فقط دون أي زيادة.
                    
                    إليك قاعدة المعرفة:\n${medicineDb}`
                },
                {
                    role: "user",
                    content: userQuery
                }
            ],
            temperature: 0.0,
            max_tokens: 800
        }, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // إرسال الإجابة القادمة من Groq إلى تطبيق الفلاتر في سوريا
        const reply = response.data.choices[0].message.content;
        res.json({ answer: reply });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "حدث خطأ داخل السيرفر الوسيط" });
    }
});

// تشغيل السيرفر على المنصة السحابية
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Proxy server running on port ${PORT}`));
