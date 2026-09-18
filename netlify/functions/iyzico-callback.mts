import type { Config } from "@netlify/functions";
import Iyzipay from "iyzipay";

export default async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = Netlify.env.get("IYZICO_API_KEY");
  const secretKey = Netlify.env.get("IYZICO_SECRET_KEY");
  const uri = Netlify.env.get("IYZICO_API_URL") || "https://api.iyzipay.com";
  if (!apiKey || !secretKey) return new Response("Payment is not configured", { status: 503 });

  const form = await request.formData();
  const token = form.get("token");
  if (typeof token !== "string" || !token) return Response.redirect(new URL("/?payment=failed", request.url), 303);

  const iyzipay = new Iyzipay({ apiKey, secretKey, uri });
  const successful = await new Promise<boolean>((resolve) => {
    iyzipay.checkoutForm.retrieve({ locale: Iyzipay.LOCALE.TR, token }, (error: Error | null, result: any) => {
      if (error) console.error("iyzico checkout verification failed", error.message);
      resolve(!error && result?.status === "success" && result?.paymentStatus === "SUCCESS");
    });
  });

  return Response.redirect(new URL(`/?payment=${successful ? "success" : "failed"}`, request.url), 303);
};

export const config: Config = { path: "/api/iyzico-callback" };
