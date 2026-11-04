export type MailAccount = {
  id: string;
  email: string;
  host: string;
  port: number;
};
export type MailNotice = {
  accountId: string;
  account: string;
  subject: string;
  code: string | null;
};
