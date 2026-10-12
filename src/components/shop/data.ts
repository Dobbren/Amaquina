import teePreto from "@/assets/tee-preta.jpg";
import teeRosa from "@/assets/tee-rosa.jpg";
import teeRosaClaro from "@/assets/tee-rosa-claro.jpg";
import teeBranco from "@/assets/tee-branca.jpg";
import teePretoThumb from "@/assets/tee-preta-thumb.webp";
import teeRosaThumb from "@/assets/tee-rosa-thumb.webp";
import teeRosaClaroThumb from "@/assets/tee-rosa-claro-thumb.webp";
import teeBrancoThumb from "@/assets/tee-branca-thumb.webp";

export const PRODUCT_NAME = "Camiseta Original A MÁQUINA";
// Preço base. Cada cor tem o seu \`price\`, que tem de ser igual ao valor cobrado no seu checkout.
export const PRICE = 15000;

// Número de apoio (só dígitos, com indicativo, ex.: "244923000000").
// Fica null até existir um número real — enquanto for null, nada de WhatsApp é mostrado.
export const SUPPORT_WHATSAPP: string | null = null;

// Método aceite pelo checkout externo (EntityPay). Pagamento antes do envio.
export const PAYMENT_METHODS = ["Por referência (entidade + referência)"];

export const COLOR_IDS = ["preto", "rosa", "rosa-claro", "branco"] as const;
export type ColorId = (typeof COLOR_IDS)[number];

export type ColorVariant = {
  id: ColorId;
  name: string;
  image: string;
  thumb: string;
  swatch: string;
  /** Preço em Kz: tem de coincidir com o valor do checkout desta cor. */
  price: number;
  /**
   * Link de pagamento desta cor. Para trocar, altera só esta linha.
   * null = cor fica visível mas não pode ser encomendada.
   */
  checkoutUrl: string | null;
};

export const COLORS: ColorVariant[] = [
  {
    id: "preto",
    name: "Preto",
    image: teePreto,
    thumb: teePretoThumb,
    swatch: "oklch(0.18 0 0)",
    price: PRICE,
    checkoutUrl: "https://emis-multicaixa.com/preta",
  },
  {
    id: "rosa",
    name: "Rosa",
    image: teeRosa,
    thumb: teeRosaThumb,
    swatch: "oklch(0.72 0.19 350)",
    price: PRICE,
    checkoutUrl: "https://emis-multicaixa.com/rosa",
  },
  {
    id: "rosa-claro",
    name: "Rosa claro",
    image: teeRosaClaro,
    thumb: teeRosaClaroThumb,
    swatch: "oklch(0.9 0.06 350)",
    price: PRICE,
    checkoutUrl: "https://emis-multicaixa.com/rosa-claro",
  },
  {
    id: "branco",
    name: "Branco",
    image: teeBranco,
    thumb: teeBrancoThumb,
    swatch: "oklch(0.98 0 0)",
    price: 25000,
    checkoutUrl: "https://emis-multicaixa.com/branca",
  },
];

export const SIZES = ["S", "M", "L", "XL", "XXL"] as const;
export type Size = (typeof SIZES)[number];

export const SIZE_GUIDE = [
  { size: "S", chest: "96 cm", length: "68 cm" },
  { size: "M", chest: "102 cm", length: "70 cm" },
  { size: "L", chest: "108 cm", length: "72 cm" },
  { size: "XL", chest: "114 cm", length: "74 cm" },
  { size: "XXL", chest: "120 cm", length: "76 cm" },
];

// Províncias e municípios: src/lib/angola.ts. Zonas de entrega confirmadas: src/lib/delivery.ts.

// Fim da promoção (hora de Angola). Depois desta data o aviso deixa de aparecer.
export const PROMO_END = new Date("2026-10-15T23:59:59+01:00");
export const PROMO_LABEL = "Promoção especial válida até dia 15 de Outubro";
export const isPromoActive = (now = new Date()) => now.getTime() <= PROMO_END.getTime();

export const isColorId = (value: unknown): value is ColorId =>
  typeof value === "string" && (COLOR_IDS as readonly string[]).includes(value);

// Formatação manual: igual no servidor e no browser (evita diferenças de hidratação).
export const formatKz = (value: number) =>
  `${Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")} Kz`;

export const colorById = (id: ColorId) => COLORS.find((c) => c.id === id)!;

export const whatsappLink = (message: string) =>
  SUPPORT_WHATSAPP ? `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}` : null;
