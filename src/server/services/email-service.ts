import { Resend } from "resend";

import { env } from "@/env";

interface SendEmailOptions {
  html: string;
  subject: string;
  to: string;
}

interface EmailService {
  send(options: SendEmailOptions): Promise<void>;
}

class ResendEmailService implements EmailService {
  private resend: Resend;

  constructor(
    apiKey: string,
    private fromEmail: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send({ html, subject, to }: SendEmailOptions): Promise<void> {
    await this.resend.emails.send({
      from: this.fromEmail,
      html,
      subject,
      to,
    });
  }
}

let _emailService: EmailService | undefined;

export function getEmailService() {
  _emailService ??= new ResendEmailService(
    env.RESEND_API_KEY,
    env.RESEND_FROM_EMAIL,
  );

  return _emailService;
}
