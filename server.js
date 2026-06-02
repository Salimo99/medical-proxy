const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// قراءة المفتاح من متغيرات البيئة بآمان (تأكد من وضع مفتاح OpenRouter في Render)
const OPENROUTER_API_KEY = process.env.GEMINI_API_KEY;

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

        // رابط منصة OpenRouter الموحد والرسمي
        const url = 'https://openrouter.ai/api/v1/chat/completions';

        const requestBody = {
            model: "google/gemini-2.5-flash:free", // النموذج المجاني تماماً ذو السعة المليونية للتوكنز
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
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                // ⚠️ الـ Headers المطلوبة رسمياً في توثيق OpenRouter للحسابات المجانية:
                'HTTP-Referer': 'https://my-medical-proxy-api.onrender.com', 
                'X-Title': 'Medical Graduation Project'
            }
        });

        // استخراج النص بحسب الهيكلية القياسية لـ OpenRouter
        if (response.data && response.data.choices && response.data.choices[0].message.content) {
            const reply = response.data.choices[0].message.content;
            res.json({ answer: reply });
        } else {
            console.error("⚠️ هيكل غير متوقع:", JSON.stringify(response.data));
            res.status(500).json({ error: "استجابة السيرفر غير متوقعة الهيكل" });
        }

    } catch (error) {
        console.error("❌ OpenRouter API Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "حدث خطأ أثناء الاتصال بسيرفر الذكاء الاصطناعي" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`OpenRouter Verified Server running on port ${PORT}`));
