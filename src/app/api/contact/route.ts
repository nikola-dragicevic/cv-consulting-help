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

    // Configure the transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Send the email
    await transporter.sendMail({
      from: process.env.SMTP_USER, // Sender address
      to: process.env.CONTACT_EMAIL, // Receiver (you)
      replyTo: email, // So you can hit "Reply" to answer the user
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
  } catch (error: any) {
    console.error("Email error:", error);
    return NextResponse.json({ error: "Kunde inte skicka meddelandet." }, { status: 500 });
  }
}