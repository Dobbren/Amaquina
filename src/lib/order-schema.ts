import { z } from "zod";
import { COLOR_IDS, SIZES } from "@/components/shop/data";
import { PROVINCIAS, isMunicipioDe } from "./angola";

// Telefone angolano: 9 dígitos começados por 9, com ou sem +244 / 244 / espaços.
export const normalizePhone = (raw: string) => {
  const digits = raw.replace(/\D/g, "").replace(/^00/, "");
  return digits.length === 12 && digits.startsWith("244") ? digits.slice(3) : digits;
};

const text = (min: number, max: number, message: string) =>
  z
    .string({ required_error: message })
    .trim()
    .min(min, message)
    .max(max, `Máximo de ${max} caracteres.`);

// Esquema partilhado: o mesmo é usado no formulário e no servidor.
export const orderSchema = z
  .object({
    nome: text(3, 100, "Indica o teu nome completo.").refine(
      (v) => v.split(/\s+/).length >= 2,
      "Indica o nome e o apelido.",
    ),
    telefone: z
      .string({ required_error: "Indica o teu número de telefone." })
      .transform(normalizePhone)
      .refine((v) => /^9\d{8}$/.test(v), "Número inválido. Usa 9 dígitos, ex.: 923 456 789."),
    provincia: z.enum(PROVINCIAS, {
      errorMap: () => ({ message: "Escolhe a província." }),
    }),
    municipio: z.string({ required_error: "Escolhe o município." }).min(1, "Escolhe o município."),
    bairro: text(2, 80, "Indica o bairro ou zona."),
    endereco: text(3, 200, "Indica a rua, avenida ou o endereço."),
    referencia: text(3, 200, "Indica um ponto de referência perto de ti."),
    cor: z.enum(COLOR_IDS, { errorMap: () => ({ message: "Escolhe uma cor válida." }) }),
    tamanho: z.enum(SIZES, { errorMap: () => ({ message: "Escolhe o tamanho." }) }),
    quantidade: z.literal(1),
    // Gerado no browser por tentativa de pedido; permite ao destino ignorar duplicados.
    pedidoId: z.string().regex(/^[A-Z0-9]{8}$/),
    // Como a província/município foram escolhidos: detecção confirmada pelo cliente ou manual.
    origemLocalizacao: z.enum(["detectada", "manual"]).default("manual"),
    // Ponto GPS do cliente (autorizado por ele), para o entregador o encontrar.
    localizacao: z
      .object({
        lat: z.number().finite().min(-90).max(90),
        lon: z.number().finite().min(-180).max(180),
        precisao: z.number().finite().min(0).max(1_000_000),
      })
      .optional(),
    // Campo escondido (anti-spam). Pessoas reais deixam-no vazio.
    website: z.string().max(0).optional(),
  })
  .superRefine((order, ctx) => {
    // O município tem de pertencer à província escolhida.
    if (!isMunicipioDe(order.provincia, order.municipio)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["municipio"],
        message: `Escolhe um município de ${order.provincia}.`,
      });
    }
  });

export type OrderInput = z.input<typeof orderSchema>;
export type Order = z.output<typeof orderSchema>;
export type OrderField = keyof Order;

export type SubmitOrderResult =
  | { ok: true; pedidoId: string; cobertura: "confirmada"; checkoutUrl: string }
  // Sem cobertura confirmada: o pedido fica registado para a equipa verificar; sem pagamento.
  | { ok: true; pedidoId: string; cobertura: "a-confirmar" }
  | { ok: false; error: string; fieldErrors?: Partial<Record<OrderField, string>> };

export const newOrderId = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
};
