import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Recreate __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a transporter object using Gmail's SMTP settings
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  }
});

// Function to read and inject dynamic content into the HTML template
const renderTemplate = (templatePath, data) => {
  let template = fs.readFileSync(
    path.join(__dirname, '../email-templates', templatePath),
    'utf-8'
  );

  // Replace placeholders with dynamic data
  for (const key in data) {
    template = template.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), data[key]);
  }

  return template;
};

// Function to send email
const sendEmail = (to, subject, templateName, data) => {
  console.log("to", to)
  console.log("subject", subject)
  console.log("templateName", templateName)
  console.log("data", data)

  const htmlContent = renderTemplate(templateName, data);

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject,
    html: htmlContent,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error occurred:', error);
    } else {
      console.log('Email sent:', info.response);
    }
  });
};

export default sendEmail;
