// server.js — TMAX Survey App (Node.js Backend)
// สร้าง PDF อัตโนมัติจากแบบสำรวจและส่งอีเมลพร้อมแนบไฟล์

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// --- สร้าง Email Transporter ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// --- API: สร้าง PDF + ส่งอีเมล ---
app.post('/api/send-pdf', async (req, res) => {
    let browser;
    try {
        const data = req.body;
        
        if (!data) {
            return res.status(400).json({ success: false, error: 'ไม่มีข้อมูลที่ส่งมา' });
        }

        console.log(`📄 กำลังสร้าง PDF สำหรับ: ${data.company || 'ไม่ระบุ'}`);

        // 1. อ่าน HTML Template
        const templatePath = path.join(__dirname, 'templates', 'pdf-template.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf-8');

        // 2. แทนที่ placeholder ในเทมเพลตด้วยข้อมูลจริง
        htmlTemplate = fillTemplate(htmlTemplate, data);

        // 3. สร้าง PDF ด้วย Puppeteer
        console.log('🖨️ กำลัง render PDF...');
        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        await browser.close();
        browser = null;
        console.log(`✅ PDF สร้างเสร็จ (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

        // 4. ตั้งชื่อไฟล์ PDF
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2,'0')}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getFullYear()+543}`;
        const companyName = (data.company || 'ไม่ระบุ').replace(/[^a-zA-Z0-9ก-๙\s]/g, '').trim();
        const pdfFilename = `แบบสำรวจ-${companyName}-${dateStr}.pdf`;

        // 5. ส่งอีเมลพร้อมแนบ PDF
        const targetEmail = process.env.TARGET_EMAIL || 'jojoe20042547@gmail.com';
        const respondentName = data.rName || 'ไม่ระบุชื่อ';

        console.log(`📧 กำลังส่งอีเมลไปที่ ${targetEmail}...`);

        const mailOptions = {
            from: `"TMAX Survey System" <${process.env.SMTP_USER}>`,
            to: targetEmail,
            subject: `📋 แบบสำรวจความพึงพอใจ - ${companyName} (${dateStr})`,
            html: `
                <div style="font-family: 'Sarabun', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #1e293b, #312e81); color: white; padding: 30px; border-radius: 16px; text-align: center; margin-bottom: 20px;">
                        <h2 style="margin: 0 0 10px 0; font-size: 22px;">📋 แบบสำรวจความพึงพอใจของลูกค้า</h2>
                        <p style="margin: 0; opacity: 0.8; font-size: 14px;">FM-SA-003 REV.00</p>
                    </div>
                    
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                            <tr>
                                <td style="padding: 8px 0; color: #64748b; width: 140px;">บริษัท:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${companyName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b;">ผู้ตอบแบบสำรวจ:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${respondentName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b;">วันที่:</td>
                                <td style="padding: 8px 0; font-weight: 600;">${dateStr}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b;">คะแนนรวม:</td>
                                <td style="padding: 8px 0; font-weight: 600; color: #4f46e5;">${data.totalScore || '-'} / ${data.totalMax || '-'} (${data.totalPercent || '-'})</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #64748b;">เกรด:</td>
                                <td style="padding: 8px 0; font-weight: 700; font-size: 20px; color: #4f46e5;">${data.totalGrade || '-'}</td>
                            </tr>
                        </table>
                    </div>
                    
                    <p style="font-size: 13px; color: #94a3b8; text-align: center;">
                        📎 ไฟล์ PDF แนบอยู่ในอีเมลนี้ — <strong>${pdfFilename}</strong><br>
                        ส่งโดยระบบ TMAX Survey อัตโนมัติ
                    </p>
                </div>
            `,
            attachments: [{
                filename: pdfFilename,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        };

        await transporter.sendMail(mailOptions);
        console.log('✅ ส่งอีเมลสำเร็จ!');

        res.json({ success: true, message: 'สร้าง PDF และส่งอีเมลเรียบร้อยแล้ว', filename: pdfFilename });

    } catch (error) {
        console.error('❌ Error:', error);
        if (browser) await browser.close();
        res.status(500).json({ 
            success: false, 
            error: 'เกิดข้อผิดพลาดในการสร้าง PDF หรือส่งอีเมล',
            detail: error.message 
        });
    }
});

// --- API: สร้าง PDF เฉยๆ (ดาวน์โหลด ไม่ส่งอีเมล) ---
app.post('/api/download-pdf', async (req, res) => {
    let browser;
    try {
        const data = req.body;
        
        const templatePath = path.join(__dirname, 'templates', 'pdf-template.html');
        let htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
        htmlTemplate = fillTemplate(htmlTemplate, data);

        browser = await puppeteer.launch({ 
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        await browser.close();
        browser = null;

        const companyName = (data.company || 'ไม่ระบุ').replace(/[^a-zA-Z0-9ก-๙\s]/g, '').trim();
        const now = new Date();
        const dateStr = `${now.getDate().toString().padStart(2,'0')}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getFullYear()+543}`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`แบบสำรวจ-${companyName}-${dateStr}.pdf`)}`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('❌ Error:', error);
        if (browser) await browser.close();
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- ฟังก์ชันแทนที่ Template ---
function fillTemplate(html, data) {
    const scoreIds = ['s1_1', 's1_2', 's1_3', 's1_4', 's2_1', 's2_2', 's2_3', 's3_1', 's3_2', 's3_3', 's3_4'];
    
    // ข้อมูลทั่วไป
    html = html.replace(/{{company}}/g, escHtml(data.company || ''));
    html = html.replace(/{{surveyor_name}}/g, escHtml(data.sName || ''));
    html = html.replace(/{{surveyor_tel}}/g, escHtml(data.sTel || ''));
    html = html.replace(/{{surveyor_email}}/g, escHtml(data.sEmail || ''));
    html = html.replace(/{{respondent_name}}/g, escHtml(data.rName || ''));
    html = html.replace(/{{respondent_tel}}/g, escHtml(data.rTel || ''));
    html = html.replace(/{{respondent_email}}/g, escHtml(data.rEmail || ''));
    
    // Checkbox ประเภทธุรกิจ
    for (let i = 0; i < 5; i++) {
        const checked = data.types && data.types[i] ? 'checked' : '';
        html = html.replace(`{{type_${i+1}_checked}}`, checked);
    }
    
    // คะแนน
    if (data.scores) {
        scoreIds.forEach(id => {
            const score = data.scores[id] || {};
            html = html.replace(`{{max_${id}}}`, escHtml(score.max || ''));
            html = html.replace(`{{val_${id}}}`, escHtml(score.val || ''));
            html = html.replace(`{{note_${id}}}`, escHtml(score.note || ''));
        });
    }
    
    // สรุปผล
    html = html.replace(/{{totalMax}}/g, escHtml(data.totalMax || ''));
    html = html.replace(/{{totalScore}}/g, escHtml(data.totalScore || ''));
    html = html.replace(/{{totalPercent}}/g, escHtml(data.totalPercent || ''));
    html = html.replace(/{{totalGrade}}/g, escHtml(data.totalGrade || ''));
    
    // ข้อเสนอแนะ
    const suggestions = (data.sug || '').split('\n');
    html = html.replace('{{sug_1}}', escHtml(suggestions[0] || ''));
    html = html.replace('{{sug_2}}', escHtml(suggestions[1] || ''));
    html = html.replace('{{sug_3}}', escHtml(suggestions[2] || ''));
    
    // วันที่ (พ.ศ.)
    const now = new Date();
    html = html.replace('{{date_day}}', now.getDate().toString().padStart(2, '0'));
    html = html.replace('{{date_month}}', (now.getMonth() + 1).toString().padStart(2, '0'));
    html = html.replace('{{date_year}}', (now.getFullYear() + 543).toString());
    
    return html;
}

function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- เริ่ม Server ---
app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   🚀 TMAX Survey App กำลังทำงาน                  ║');
    console.log(`║   📌 http://localhost:${PORT}                       ║`);
    console.log('║   📧 SMTP: ' + (process.env.SMTP_USER || '⚠️ ยังไม่ตั้งค่า (.env)').padEnd(38) + '║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
});
