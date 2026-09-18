import type { Config, Context } from "@netlify/functions";
import Iyzipay from "iyzipay";

type CartLine = { id: number; quantity: number };
type CheckoutBody = {
  cart?: CartLine[];
  customer?: {
    name?: string;
    surname?: string;
    email?: string;
    phone?: string;
    identityNumber?: string;
    address?: string;
    city?: string;
    zipCode?: string;
  };
};

const catalog = {
  1: { name: "Gül Bahçesi Şal", category: "Şal", price: 899 },
  2: { name: "Kahve Tonları Eşarp", category: "Eşarp", price: 899 },
  3: { name: "Vintage Pudra Şal", category: "Şal", price: 899 },
} as const;

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default async (request: Request, context: Context) => {
  if (request.method !== "POST") return json({ error: "Yalnızca POST isteği kabul edilir." }, 405);

  const apiKey = Netlify.env.get("IYZICO_API_KEY");
  const secretKey = Netlify.env.get("IYZICO_SECRET_KEY");
  const apiUrl = Netlify.env.get("IYZICO_API_URL") || "https://api.iyzipay.com";
  if (!apiKey || !secretKey) return json({ error: "Ödeme sistemi henüz yapılandırılmadı." }, 503);

  let body: CheckoutBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Geçersiz istek." }, 400);
  }

  const customer = body.customer;
  const required = [customer?.name, customer?.surname, customer?.email, customer?.phone,
    customer?.identityNumber, customer?.address, customer?.city, customer?.zipCode];
  if (required.some((value) => !value?.trim())) return json({ error: "Teslimat bilgilerini eksiksiz doldurun." }, 400);
  if (!Array.isArray(body.cart) || body.cart.length === 0) return json({ error: "Sepetiniz boş." }, 400);

  const basketItems: Array<Record<string, string>> = [];
  let total = 0;
  for (const line of body.cart) {
    const product = catalog[line.id as keyof typeof catalog];
    if (!product || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) {
      return json({ error: "Sepette geçersiz bir ürün veya adet var." }, 400);
    }
    for (let i = 0; i < line.quantity; i++) {
      total += product.price;
      basketItems.push({
        id: `${line.id}-${i + 1}`,
        name: product.name,
        category1: product.category,
        itemType: Iyzipay.BASKET_ITEM_TYPE.PHYSICAL,
        price: product.price.toFixed(2),
      });
    }
  }

  const conversationId = crypto.randomUUID();
  const siteOrigin = new URL(request.url).origin;
  const ip = context.ip || "127.0.0.1";
  const fullAddress = customer!.address!.trim();
  const fullName = `${customer!.name!.trim()} ${customer!.surname!.trim()}`;
  const iyzipay = new Iyzipay({ apiKey, secretKey, uri: apiUrl });

  const paymentRequest = {
    locale: Iyzipay.LOCALE.TR,
    conversationId,
    price: total.toFixed(2),
    paidPrice: total.toFixed(2),
    currency: Iyzipay.CURRENCY.TRY,
    basketId: conversationId,
    paymentGroup: Iyzipay.PAYMENT_GROUP.PRODUCT,
    callbackUrl: `${siteOrigin}/api/iyzico-callback`,
    enabledInstallments: [2, 3, 6, 9],
    buyer: {
      id: conversationId,
      name: customer!.name!.trim(), surname: customer!.surname!.trim(),
      gsmNumber: customer!.phone!.trim(), email: customer!.email!.trim(),
      identityNumber: customer!.identityNumber!.trim(), registrationAddress: fullAddress,
      ip, city: customer!.city!.trim(), country: "Türkiye", zipCode: customer!.zipCode!.trim(),
    },
    shippingAddress: { contactName: fullName, city: customer!.city!.trim(), country: "Türkiye", address: fullAddress, zipCode: customer!.zipCode!.trim() },
    billingAddress: { contactName: fullName, city: customer!.city!.trim(), country: "Türkiye", address: fullAddress, zipCode: customer!.zipCode!.trim() },
    basketItems,
  };

  return await new Promise<Response>((resolve) => {
    iyzipay.checkoutFormInitialize.create(paymentRequest, (error: Error | null, result: any) => {
      if (error || result?.status !== "success" || !result?.paymentPageUrl) {
        console.error("iyzico checkout initialization failed", error?.message || result?.errorCode);
        resolve(json({ error: result?.errorMessage || "Ödeme sayfası başlatılamadı." }, 502));
        return;
      }
      resolve(json({ paymentPageUrl: result.paymentPageUrl }));
    });
  });
};

export const config: Config = { path: "/api/iyzico-checkout" };
