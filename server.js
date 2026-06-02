const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ⚠️ اذهب إلى Render وضع مفتاح Groq الجديد في الـ Environment Variable بنفس الاسم
const GROQ_API_KEY = process.env.GEMINI_API_KEY; 

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

        // رابط منصة Groq الرسمية
        const url = 'https://api.groq.com/openai/v1/chat/completions';

        // هيكلية الطلب القياسية المعتمدة في Groq (تعتمد نظام OpenAI)
        const requestBody = {
            model: "llama-3.1-8b-instant", // نموذج ميتا الجبار والمجاني بالكامل
            messages: [
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
                    - ابدأ الرد بترحيب طبي لطيف يذكر اسم الدواء، واختم الرد بعبارة تمنيات بالسلامة.

                    إليك قاعدة المعرفة الكاملة للأدوية:\n${medicineDb}`
                },
                {
                    role: "user",
                    content: userQuery
                }
            ],
            temperature: 0.3
        };

        const response = await axios.post(url, requestBody, {
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // استخراج النص بحسب هيكلية Groq
        if (response.data && response.data.choices && response.data.choices[0].message.content) {
            const reply = response.data.choices[0].message.content;
            res.json({ answer: reply });
        } else {
            res.status(500).json({ error: "استجابة السيرفر غير متوقعة الهيكل" });
        }

    } catch (error) {
        console.error("❌ Groq API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال بسيرفر الذكاء الاصطناعي" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Groq Medical Server running on port ${PORT}`));
