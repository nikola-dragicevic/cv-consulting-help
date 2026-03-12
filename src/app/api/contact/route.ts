// src/app/api/contact/route.ts
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, message } = body;

    if (!email || !message) {
      return NextResponse.json({ error: "E-post och meddelande krävs" }, { status: 400 });
    }

    const smtpHost = process.env.BUSINESS_SMTP_HOST || process.env.SMTP_HOST;
    const smtpPort = Number(process.env.BUSINESS_SMTP_PORT || process.env.SMTP_PORT || 465);
    const smtpSecure = (process.env.BUSINESS_SMTP_SECURE || process.env.SMTP_SECURE || "true") === "true";
    const smtpUser = process.env.BUSINESS_SMTP_USER || process.env.SMTP_USER;
    const smtpPass = process.env.BUSINESS_SMTP_PASS || process.env.SMTP_PASS;
    const contactEmail = process.env.BUSINESS_CONTACT_EMAIL || process.env.CONTACT_EMAIL || smtpUser;

    if (!smtpHost || !smtpUser || !smtpPass || !contactEmail) {
      return NextResponse.json({ error: "E-postkonfiguration saknas." }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: smtpUser,
      to: contactEmail,
      replyTo: email,
      subject: `Nytt meddelande från JobbNu: ${email}`,
      text: message,
      html: `
        <h3>Nytt meddelande från kontaktformuläret</h3>
        <p><strong>Från:</strong> ${email}</p>
        <p><strong>Meddelande:</strong></p>
        <blockquote style="border-left: 4px solid #ccc; padding-left: 10px; margin-left: 0;">
          ${message.replace(/\n/g, "<br>")}
        </blockquote>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Email error:", error);
    return NextResponse.json({ error: "Kunde inte skicka meddelandet." }, { status: 500 });
  }
}
