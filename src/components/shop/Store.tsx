import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowPathIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  BanknotesIcon,
  MapPinIcon,
  ShieldCheckIcon,
  TruckIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitOrder } from "@/lib/order.functions";
import { trackPixel } from "@/lib/pixel";
import { newOrderId, orderSchema, type OrderField, type OrderInput } from "@/lib/order-schema";
import { MUNICIPIOS, PROVINCIAS, isMunicipioDe, isProvincia } from "@/lib/angola";
import { coverageFor, type Coverage } from "@/lib/delivery";
import { LocationCard, LocationGate, useLocationDetect } from "./LocationDetect";
import {
  COLORS,
  PRODUCT_NAME,
  PROMO_LABEL,
  SIZES,
  SIZE_GUIDE,
  colorById,
  isColorId,
  formatKz,
  isPromoActive,
  whatsappLink,
  type ColorId,
  type Size,
} from "./data";

type DeliveryForm = {
  nome: string;
  telefone: string;
  provincia: string;
  municipio: string;
  bairro: string;
  endereco: string;
  referencia: string;
  website: string;
};

type FieldErrors = Partial<Record<OrderField, string | undefined>>;

type Registered = {
  pedidoId: string;
  /** null = entrega a confirmar pela equipa; ainda não há pagamento. */
  checkoutUrl: string | null;
  cor: ColorId;
  tamanho: Size;
};

const DEFAULT_COLOR: ColorId = "preto";
const LOCATION_PENDING = "Escolhe primeiro o município";

// Parâmetros do píxel: só dados do produto, nunca dados pessoais.
const pixelParams = (id: ColorId) => {
  const v = colorById(id);
  return {
    content_ids: [v.id],
    content_name: `${PRODUCT_NAME} ${v.name}`,
    content_type: "product" as const,
    value: v.price,
    currency: "AOA" as const,
  };
};

export function Store() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const submit = useServerFn(submitOrder);

  // A cor vem do URL (?cor=), validado na rota — é a única fonte de verdade.
  const color: ColorId = isColorId(search.cor) ? search.cor : DEFAULT_COLOR;
  const colorIndex = COLORS.findIndex((c) => c.id === color);
  const selected = colorById(color);

  const [size, setSize] = useState<Size | null>(null);
  const [form, setForm] = useState<DeliveryForm>({
    nome: "",
    telefone: "",
    provincia: "",
    municipio: "",
    bairro: "",
    endereco: "",
    referencia: "",
    website: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registered, setRegistered] = useState<Registered | null>(null);
  const inFlight = useRef(false);
  // O mesmo id é reutilizado em novas tentativas do mesmo pedido (evita duplicados no destino).
  const orderId = useRef<string | null>(null);

  // Localização detectada: preenche só o que foi identificado, sem apagar o resto do formulário.
  const location = useLocationDetect((match) => {
    if (!match.provincia) return;
    const provincia = match.provincia;
    setForm((f) => ({
      ...f,
      provincia,
      municipio: match.municipio ?? (f.provincia === provincia ? f.municipio : ""),
      bairro: f.bairro.trim() ? f.bairro : (match.localidade ?? ""),
    }));
    setErrors((e) => ({ ...e, provincia: undefined, municipio: undefined }));
  });
  const origemLocalizacao = location.state.s === "confirmed" ? "detectada" : "manual";
  // O ponto GPS só segue se o cliente não corrigiu a zona para outro sítio
  // (ao corrigir, a detecção volta a "idle").
  const localizacao = location.state.s === "idle" ? undefined : (location.coords ?? undefined);

  const selectColor = (id: ColorId) => {
    if (id === color) return;
    navigate({ search: { cor: id }, replace: true, resetScroll: false });
  };

  // Em ligações lentas o cliente pode preencher campos antes de o React carregar:
  // aproveita esses valores em vez de os ignorar.
  useEffect(() => {
    const keys = [
      "nome",
      "provincia",
      "municipio",
      "bairro",
      "endereco",
      "referencia",
      "telefone",
    ] as const;
    const patch: Partial<DeliveryForm> = {};
    for (const key of keys) {
      const el = document.getElementById(`f-${key}`) as HTMLInputElement | HTMLSelectElement | null;
      if (el?.value) patch[key] = el.value;
    }
    if (Object.keys(patch).length > 0) setForm((f) => ({ ...f, ...patch }));
  }, []);

  // Píxel: o cliente viu esta cor (no carregamento e a cada troca).
  useEffect(() => {
    trackPixel("ViewContent", pixelParams(color));
  }, [color]);

  // Se o cliente mudar cor ou tamanho depois de registar, volta a pedir confirmação.
  useEffect(() => {
    if (registered && (registered.cor !== color || registered.tamanho !== size)) {
      setRegistered(null);
    }
  }, [color, size, registered]);

  const step = (dir: 1 | -1) => {
    const next = (colorIndex + dir + COLORS.length) % COLORS.length;
    selectColor(COLORS[next]!.id);
  };

  const payload = (): OrderInput => ({
    nome: form.nome,
    telefone: form.telefone,
    provincia: form.provincia as OrderInput["provincia"],
    municipio: form.municipio as OrderInput["municipio"],
    bairro: form.bairro,
    endereco: form.endereco,
    referencia: form.referencia,
    cor: color,
    tamanho: (size ?? "") as Size,
    quantidade: 1,
    pedidoId: (orderId.current ??= newOrderId()),
    origemLocalizacao,
    localizacao,
    website: form.website,
  });

  const validate = (): FieldErrors => {
    const parsed = orderSchema.safeParse(payload());
    if (parsed.success) return {};
    const next: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as OrderField | undefined;
      if (key && !next[key]) next[key] = issue.message;
    }
    return next;
  };

  const update = (field: keyof DeliveryForm, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field as OrderField]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // Mudar de província limpa só o município (que pertence à província anterior).
  const changeProvincia = (value: string) => {
    setForm((f) => ({
      ...f,
      provincia: value,
      municipio: isProvincia(value) && isMunicipioDe(value, f.municipio) ? f.municipio : "",
    }));
    setErrors((e) => ({ ...e, provincia: undefined, municipio: undefined }));
    location.reset();
  };

  const changeMunicipio = (value: string) => {
    update("municipio", value);
    // Completar um município que a detecção não identificou não invalida a detecção;
    // trocar o município detectado já é uma correcção manual.
    const s = location.state;
    if (
      (s.s === "detected" || s.s === "confirmed") &&
      s.match.municipio &&
      s.match.municipio !== value
    )
      location.reset();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    setFormError(null);

    const clientErrors = validate();
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      const first = Object.keys(clientErrors)[0];
      document.getElementById(`f-${first}`)?.focus();
      return;
    }

    inFlight.current = true;
    setSubmitting(true);
    try {
      const result = await submit({ data: payload() });
      if (result.ok) {
        const confirmada = result.cobertura === "confirmada";
        trackPixel(confirmada ? "InitiateCheckout" : "Lead", pixelParams(color), result.pedidoId);
        // Se o cliente corrigir os dados, o novo envio precisa de outro id (senão o destino ignora-o).
        orderId.current = null;
        setRegistered({
          pedidoId: result.pedidoId,
          checkoutUrl: confirmada ? result.checkoutUrl : null,
          cor: color,
          tamanho: size!,
        });
        requestAnimationFrame(() =>
          document.getElementById("pedido")?.scrollIntoView({ behavior: "smooth", block: "start" }),
        );
      } else {
        const fieldErrors = result.fieldErrors ?? {};
        setErrors(fieldErrors);
        setFormError(result.error);
        const first = Object.keys(fieldErrors)[0];
        if (first) document.getElementById(`f-${first}`)?.focus();
      }
    } catch {
      setFormError("Sem ligação ao servidor. Verifica a internet e tenta novamente.");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const help = whatsappLink(`Olá A MÁQUINA! Tenho uma dúvida sobre a ${PRODUCT_NAME}.`);
  const promoActive = isPromoActive();
  const provincia = isProvincia(form.provincia) ? form.provincia : null;
  const locationReady = provincia !== null && form.municipio !== "";
  const coverage = coverageFor(provincia, form.municipio || null);
  const aConfirmar = coverage.estado === "a-confirmar";

  return (
    <>
      <LocationGate
        state={location.state}
        permission={location.permission}
        onDetect={location.detect}
      />

      {/* PRODUTO */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-10 pt-4 sm:px-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-12 md:pt-10">
        <div className="min-w-0 md:sticky md:top-6 md:self-start">
          <Gallery colorIndex={colorIndex} onStep={step} />
          <ColorStrip color={color} onSelect={selectColor} />
        </div>

        <div className="min-w-0">
          <h1 className="text-[clamp(1.25rem,4.5vw,1.875rem)] leading-tight">{PRODUCT_NAME}</h1>
          <p className="mt-2 font-display text-2xl">{formatKz(selected.price)}</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold">
            <TruckIcon className="h-4 w-4 shrink-0" />
            Entrega grátis em todas as encomendas feitas pelo site
          </p>
          {promoActive && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-md bg-promo px-2.5 py-1 text-xs font-bold uppercase tracking-[0.06em] text-promo-foreground">
              <ClockIcon className="h-3.5 w-3.5 shrink-0" />
              {PROMO_LABEL}
            </p>
          )}

          <div className="mt-6">
            <p className="text-sm">
              Cor: <span className="font-semibold">{selected.name}</span>
            </p>
            <div className="mt-3 flex gap-2.5" role="radiogroup" aria-label="Cor">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={c.id === color}
                  aria-label={c.name}
                  onClick={() => selectColor(c.id)}
                  className={`grid h-10 w-10 place-items-center rounded-md border transition-colors duration-150 ${
                    c.id === color
                      ? "border-foreground"
                      : "border-border hover:border-foreground/50"
                  }`}
                >
                  <span
                    className="h-7 w-7 rounded-[3px] border border-border"
                    style={{ backgroundColor: c.swatch }}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-baseline justify-between">
              <p className="text-sm">
                Tamanho: <span className="font-semibold">{size ?? "escolhe"}</span>
              </p>
              <SizeGuide />
            </div>
            <div
              id="f-tamanho"
              tabIndex={-1}
              className="mt-3 grid grid-cols-5 gap-2 outline-none"
              role="radiogroup"
              aria-label="Tamanho"
            >
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  onClick={() => {
                    setSize(s);
                    setErrors((e) => ({ ...e, tamanho: undefined }));
                  }}
                  className={`h-11 rounded-md border text-sm font-semibold transition-colors duration-150 ${
                    size === s
                      ? "border-foreground bg-foreground text-background"
                      : "border-border hover:border-foreground/50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <FieldError message={errors.tamanho} />
          </div>

          <Button
            type="button"
            variant="hero"
            size="xl"
            className="mt-8 hidden h-11 w-full md:flex"
            onClick={() => document.getElementById("f-nome")?.focus()}
          >
            Encomendar agora
          </Button>
        </div>
      </section>

      {/* PEDIDO */}
      <section id="pedido" className="scroll-mt-4 border-t border-border bg-card">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 md:py-14">
          {registered ? (
            <PaymentStep
              registered={registered}
              phone={form.telefone}
              address={[form.endereco, form.bairro, form.municipio, form.provincia]
                .map((v) => v.trim())
                .filter(Boolean)
                .join(", ")}
              onEdit={() => setRegistered(null)}
            />
          ) : (
            <form noValidate onSubmit={onSubmit}>
              <h2 className="text-xl">Dados de entrega</h2>
              <p className="mt-1 text-sm text-muted-foreground">Sem conta, sem registo.</p>

              <LocationCard
                state={location.state}
                onDetect={location.detect}
                onConfirm={location.confirm}
                onCorrect={() => document.getElementById("f-provincia")?.focus()}
                confirmedLabel={[form.municipio, form.provincia].filter(Boolean).join(", ")}
                hasCoords={localizacao !== undefined}
              />
              <RegionNotice provincia={provincia} coverage={coverage} />

              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Field
                  id="nome"
                  label="Nome completo"
                  error={errors.nome}
                  className="sm:col-span-2"
                >
                  <Input
                    id="f-nome"
                    autoComplete="name"
                    placeholder="Ex.: João Manuel"
                    maxLength={100}
                    value={form.nome}
                    onChange={(e) => update("nome", e.target.value)}
                    aria-invalid={!!errors.nome}
                    className="h-11 bg-background"
                  />
                </Field>
                <Field id="provincia" label="Província" error={errors.provincia}>
                  <select
                    id="f-provincia"
                    autoComplete="address-level1"
                    value={form.provincia}
                    onChange={(e) => changeProvincia(e.target.value)}
                    aria-invalid={!!errors.provincia}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm"
                  >
                    <option value="" disabled>
                      Escolhe a província…
                    </option>
                    {PROVINCIAS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="municipio" label="Município" error={errors.municipio}>
                  <select
                    id="f-municipio"
                    autoComplete="address-level2"
                    value={form.municipio}
                    onChange={(e) => changeMunicipio(e.target.value)}
                    disabled={!provincia}
                    aria-invalid={!!errors.municipio}
                    className="h-11 w-full rounded-md border border-input bg-background px-3 text-base disabled:opacity-60 md:text-sm"
                  >
                    <option value="" disabled>
                      {provincia ? "Escolhe o município…" : "Escolhe primeiro a província"}
                    </option>
                    {provincia &&
                      MUNICIPIOS[provincia].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field
                  id="bairro"
                  label="Bairro ou zona"
                  error={errors.bairro}
                  className="sm:col-span-2"
                >
                  <Input
                    id="f-bairro"
                    autoComplete="address-level3"
                    placeholder={
                      locationReady
                        ? provincia === "Luanda"
                          ? "Ex.: Benfica, Golfe 2, Morro Bento"
                          : "Ex.: nome do bairro, zona ou aldeia"
                        : LOCATION_PENDING
                    }
                    disabled={!locationReady}
                    maxLength={80}
                    value={form.bairro}
                    onChange={(e) => update("bairro", e.target.value)}
                    aria-invalid={!!errors.bairro}
                    className="h-11 bg-background"
                  />
                </Field>
                <Field
                  id="endereco"
                  label="Rua, avenida ou endereço"
                  error={errors.endereco}
                  className="sm:col-span-2"
                >
                  <Input
                    id="f-endereco"
                    autoComplete="street-address"
                    placeholder={
                      locationReady ? "Indica a rua, avenida ou o endereço" : LOCATION_PENDING
                    }
                    disabled={!locationReady}
                    maxLength={200}
                    value={form.endereco}
                    onChange={(e) => update("endereco", e.target.value)}
                    aria-invalid={!!errors.endereco}
                    className="h-11 bg-background"
                  />
                </Field>
                <Field
                  id="referencia"
                  label="Ponto de referência"
                  error={errors.referencia}
                  className="sm:col-span-2"
                >
                  <Input
                    id="f-referencia"
                    placeholder={
                      locationReady
                        ? "Ex.: perto de uma escola, mercado ou paragem conhecida"
                        : LOCATION_PENDING
                    }
                    disabled={!locationReady}
                    maxLength={200}
                    value={form.referencia}
                    onChange={(e) => update("referencia", e.target.value)}
                    aria-invalid={!!errors.referencia}
                    className="h-11 bg-background"
                  />
                </Field>
                <Field
                  id="telefone"
                  label="Telefone para a entrega"
                  error={errors.telefone}
                  className="sm:col-span-2"
                >
                  <Input
                    id="f-telefone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="Número de contacto para a entrega"
                    maxLength={20}
                    value={form.telefone}
                    onChange={(e) => update("telefone", e.target.value)}
                    aria-invalid={!!errors.telefone}
                    aria-describedby="telefone-nota"
                    className="h-11 bg-background"
                  />
                  <p id="telefone-nota" className="mt-1.5 text-xs text-muted-foreground">
                    9 dígitos, ex.: 923 456 789. É por este número que te contactamos.
                  </p>
                </Field>
                {/* anti-spam: escondido de pessoas */}
                <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                  <label>
                    Website
                    <input
                      tabIndex={-1}
                      autoComplete="off"
                      value={form.website}
                      onChange={(e) => update("website", e.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-8 flex items-center gap-4 border-y border-border py-4">
                <img
                  src={selected.thumb}
                  alt=""
                  width={64}
                  height={64}
                  className="h-16 w-16 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-semibold">{PRODUCT_NAME}</p>
                  <p className="text-muted-foreground">
                    {selected.name}, tamanho {size ?? "por escolher"}, 1 unidade
                  </p>
                </div>
                <p className="shrink-0 font-display text-base">{formatKz(selected.price)}</p>
              </div>
              <div className="mt-3 flex justify-between gap-4 text-sm text-muted-foreground">
                <span>Entrega</span>
                <span className="text-right font-semibold text-foreground">
                  {deliveryLabel(coverage)}
                </span>
              </div>
              <div className="mt-2 flex justify-between font-display text-lg">
                <span>Total</span>
                <span>{formatKz(selected.price)}</span>
              </div>
              {promoActive && (
                <p className="mt-2 text-right text-xs text-muted-foreground">{PROMO_LABEL}.</p>
              )}

              <div className="mt-6 rounded-md border border-border px-4 py-3.5 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <InformationCircleIcon className="h-4 w-4 shrink-0" />
                  Como funciona a entrega?
                </p>
                <p className="mt-2 text-muted-foreground">
                  {aConfirmar
                    ? "Preenche os teus dados e envia o pedido. A nossa equipa contacta-te pelo telefone indicado para confirmar a entrega na tua zona e o prazo. A entrega é grátis e só pagas depois dessa confirmação."
                    : "Preenche os teus dados e confirma o pedido. Depois pagas por referência, no app do banco ou num ATM, e envias o comprovativo. Após a confirmação do pagamento, a nossa equipa entra em contacto contigo para combinar a entrega na morada indicada."}
                </p>
                {coverage.estado === "confirmada" && coverage.zona.prazo && (
                  <p className="mt-2 text-muted-foreground">
                    Em {provincia}, entregamos {coverage.zona.prazo}.
                  </p>
                )}
                <p className="mt-2 text-muted-foreground">
                  Confirma que o telefone está correcto e que a morada tem detalhe suficiente para
                  te encontrarmos.
                </p>
              </div>

              {formError && (
                <p
                  role="alert"
                  className="mt-6 flex items-start gap-2 rounded-md border border-destructive/50 px-3 py-2.5 text-sm text-destructive"
                >
                  <ExclamationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {formError}
                </p>
              )}

              <Button
                type="submit"
                variant="hero"
                size="xl"
                disabled={submitting}
                aria-busy={submitting}
                className="mt-6 h-12 w-full text-sm"
              >
                {submitting ? (
                  <>
                    <ArrowPathIcon className="animate-spin" /> A registar…
                  </>
                ) : aConfirmar ? (
                  "Enviar pedido para confirmação"
                ) : (
                  "Gerar referência de pagamento"
                )}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Os teus dados são usados apenas para processar e entregar esta encomenda.
              </p>
            </form>
          )}
        </div>
      </section>

      <SecurePurchase />

      <footer className="border-t border-border px-4 pb-28 pt-6 text-xs md:pb-8 text-muted-foreground sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} A MÁQUINA</p>
          {help && (
            <a
              href={help}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-4 hover:underline"
            >
              Apoio por WhatsApp
            </a>
          )}
        </div>
      </footer>

      <MobileBar colorName={selected.name} price={selected.price} hidden={!!registered} />
    </>
  );
}

function Gallery({ colorIndex, onStep }: { colorIndex: number; onStep: (dir: 1 | -1) => void }) {
  const touchX = useRef<number | null>(null);

  return (
    <div
      className="relative aspect-square w-full touch-pan-y overflow-hidden rounded-md bg-secondary select-none"
      onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) > 40) onStep(dx < 0 ? 1 : -1);
      }}
    >
      {COLORS.map((c, i) => (
        <img
          key={c.id}
          src={c.image}
          alt={`${PRODUCT_NAME} ${c.name}`}
          width={1024}
          height={1024}
          loading={i === colorIndex ? "eager" : "lazy"}
          fetchPriority={i === colorIndex ? "high" : "low"}
          decoding="async"
          draggable={false}
          aria-hidden={i !== colorIndex}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
            i === colorIndex ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <button
        type="button"
        aria-label="Cor anterior"
        onClick={() => onStep(-1)}
        className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md bg-background text-foreground opacity-80 transition-opacity hover:opacity-100"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Cor seguinte"
        onClick={() => onStep(1)}
        className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md bg-background text-foreground opacity-80 transition-opacity hover:opacity-100"
      >
        <ChevronRightIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

function ColorStrip({ color, onSelect }: { color: ColorId; onSelect: (id: ColorId) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Mantém a cor activa visível na faixa quando muda por deslize ou por link.
  useEffect(() => {
    const el = refs.current[color];
    const strip = el?.parentElement;
    if (!el || !strip || strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({
      left: el.offsetLeft - (strip.clientWidth - el.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [color]);

  return (
    <div className="mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:gap-3 sm:overflow-visible [&::-webkit-scrollbar]:hidden">
      {COLORS.map((c) => {
        const active = c.id === color;
        return (
          <button
            key={c.id}
            ref={(el) => {
              refs.current[c.id] = el;
            }}
            type="button"
            onClick={() => onSelect(c.id)}
            aria-pressed={active}
            className="w-[29%] shrink-0 snap-start text-left sm:w-[19%]"
          >
            <span
              className={`relative block overflow-hidden rounded-md border-2 transition-colors duration-150 ${
                active ? "border-foreground" : "border-transparent"
              }`}
            >
              <img
                src={c.thumb}
                alt=""
                width={400}
                height={400}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover"
              />
              {active && (
                <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-[3px] bg-foreground text-background">
                  <CheckIcon className="h-4 w-4" />
                </span>
              )}
            </span>
            <span
              className={`mt-1.5 block truncate text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}
            >
              {c.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PaymentStep({
  registered,
  phone,
  address,
  onEdit,
}: {
  registered: Registered;
  phone: string;
  address: string;
  onEdit: () => void;
}) {
  const variant = colorById(registered.cor);
  const checkoutUrl = registered.checkoutUrl;

  // Entrega ainda sem cobertura confirmada: a equipa verifica primeiro, sem pagamento.
  if (!checkoutUrl) {
    return (
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span className="grid h-6 w-6 place-items-center rounded-[3px] bg-foreground text-background">
            <CheckIcon className="h-4 w-4" />
          </span>
          Pedido recebido
        </p>
        <h2 className="mt-4 text-xl">Vamos confirmar a entrega</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pedido <span className="font-semibold text-foreground">#{registered.pedidoId}</span>
          <br />
          {variant.name}, tamanho {registered.tamanho}, {formatKz(variant.price)}
        </p>
        <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
          <li>
            1. A nossa equipa verifica a entrega em{" "}
            <span className="text-foreground">{address}</span>.
          </li>
          <li>
            2. Contactamos-te pelo <span className="text-foreground">{phone.trim()}</span> com o
            prazo da entrega (a entrega é grátis).
          </li>
          <li>
            3. Se aceitares, enviamos-te a referência de pagamento. Não pagues nada antes disso.
          </li>
        </ol>
        <button
          type="button"
          onClick={onEdit}
          className="mt-6 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Corrigir dados de entrega
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-[3px] bg-foreground text-background">
          <CheckIcon className="h-4 w-4" />
        </span>
        Dados de entrega confirmados
      </p>
      <h2 className="mt-4 text-xl">Último passo: pagamento</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Pedido <span className="font-semibold text-foreground">#{registered.pedidoId}</span>
        <br />
        {variant.name}, tamanho {registered.tamanho}, {formatKz(variant.price)}
      </p>
      <ol className="mt-4 space-y-2 text-sm text-muted-foreground">
        <li>
          1. Paga por referência no app do banco ou num ATM e envia o comprovativo. A encomenda fica
          confirmada quando o pagamento for verificado.
        </li>
        <li>
          2. Confirmado o pagamento, entramos em contacto contigo pelo{" "}
          <span className="text-foreground">{phone.trim()}</span>.
        </li>
        <li>
          3. Entregamos a encomenda em casa
          {address && (
            <>
              , em <span className="text-foreground">{address}</span>
            </>
          )}
          .
        </li>
      </ol>
      <Button variant="hero" size="xl" className="mt-6 h-12 w-full text-sm" asChild>
        <a
          href={checkoutUrl}
          onClick={() =>
            trackPixel("AddPaymentInfo", pixelParams(registered.cor), registered.pedidoId)
          }
        >
          Pagar {formatKz(variant.price)}
        </a>
      </Button>
      <button
        type="button"
        onClick={onEdit}
        className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Corrigir dados de entrega
      </button>
    </div>
  );
}

// Garantias mostradas no fim da página. Só promessas que o site cumpre de facto:
// o píxel não recebe dados pessoais e o pagamento é por referência bancária.
const GUARANTEES = [
  {
    icon: LockClosedIcon,
    title: "Os teus dados estão protegidos",
    text: "Nome, telefone e morada servem só para entregar a tua encomenda. Não divulgamos nem vendemos os teus dados.",
  },
  {
    icon: BanknotesIcon,
    title: "Pagamento pelo teu banco",
    text: "Pagas por referência no app do teu banco ou num ATM. Nunca te pedimos o PIN, códigos de confirmação ou dados do cartão.",
  },
  {
    icon: TruckIcon,
    title: "Entrega grátis",
    text: "Em todas as encomendas feitas pelo site. Em Luanda, entregamos no mesmo dia ou no dia seguinte, conforme a hora da compra.",
  },
  {
    icon: MapPinIcon,
    title: "Localização só para a entrega",
    text: "Se partilhares a tua localização, serve apenas para o entregador te encontrar.",
  },
] as const;

function SecurePurchase() {
  return (
    <section className="border-t border-border px-4 py-8 sm:px-6" aria-labelledby="compra-segura">
      <div className="mx-auto max-w-6xl">
        <h2 id="compra-segura" className="flex items-center gap-2 text-lg">
          <ShieldCheckIcon className="h-5 w-5 shrink-0" />
          Compra segura
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {GUARANTEES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function deliveryLabel(coverage: Coverage) {
  // O prazo aparece em "Como funciona a entrega?"; aqui fica só o essencial.
  if (coverage.estado === "a-confirmar") return "Grátis, prazo a confirmar";
  const custo = coverage.estado === "confirmada" ? coverage.zona.custo : 0;
  return custo === null || custo === 0 ? "Grátis" : formatKz(custo);
}

function RegionNotice({ provincia, coverage }: { provincia: string | null; coverage: Coverage }) {
  if (!provincia) return null;
  if (coverage.estado === "confirmada") {
    return (
      <p className="mt-3 flex items-start gap-2 text-sm font-semibold">
        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {coverage.zona.metodo}
          {coverage.zona.custo === 0 && " grátis"} em {provincia}
          {coverage.zona.prazo && `, ${coverage.zona.prazo}`}.
        </span>
      </p>
    );
  }
  // Cobertura parcial da província: ainda falta o município para saber.
  if (coverage.estado === "incompleta") return null;
  return (
    <div className="mt-3 text-sm">
      <p className="font-semibold">Recebe o teu produto na tua província, com entrega grátis.</p>
      <p className="mt-1 text-muted-foreground">
        Estamos a expandir as entregas para outras regiões de Angola. Indica o teu município e a tua
        morada: a nossa equipa confirma contigo a entrega e o prazo antes de pagares.
      </p>
    </div>
  );
}

function MobileBar({
  colorName,
  price,
  hidden,
}: {
  colorName: string;
  price: number;
  hidden: boolean;
}) {
  const [formVisible, setFormVisible] = useState(false);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const target = document.getElementById("pedido");
    if (!target) return;
    const io = new IntersectionObserver(([entry]) => setFormVisible(!!entry?.isIntersecting), {
      rootMargin: "0px 0px -20% 0px",
    });
    io.observe(target);
    // Esconde enquanto o teclado está aberto.
    const onFocus = (e: FocusEvent) =>
      setTyping((e.target as HTMLElement).matches?.("input, select, textarea") ?? false);
    const onBlur = () => setTyping(false);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    return () => {
      io.disconnect();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
    };
  }, []);

  if (hidden || formVisible || typing) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="min-w-0 flex-1">
        <p className="font-display text-base leading-none">{formatKz(price)}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{colorName}</p>
      </div>
      <Button
        variant="hero"
        className="h-11 px-6"
        onClick={() => document.getElementById("pedido")?.scrollIntoView({ behavior: "smooth" })}
      >
        Encomendar agora
      </Button>
    </div>
  );
}

function SizeGuide() {
  return (
    <details className="group text-right">
      <summary className="cursor-pointer list-none text-xs text-muted-foreground underline underline-offset-4">
        Guia de tamanhos
      </summary>
      <table className="mt-3 w-full text-left text-xs">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1.5 font-medium">Tam.</th>
            <th className="py-1.5 font-medium">Peito</th>
            <th className="py-1.5 font-medium">Comprimento</th>
          </tr>
        </thead>
        <tbody>
          {SIZE_GUIDE.map((row) => (
            <tr key={row.size} className="border-t border-border">
              <td className="py-1.5 font-semibold">{row.size}</td>
              <td className="py-1.5">{row.chest}</td>
              <td className="py-1.5">{row.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function Field({
  id,
  label,
  error,
  className = "",
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={`f-${id}`}>{label}</Label>
      <div className="mt-2">{children}</div>
      <FieldError message={error} />
    </div>
  );
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-destructive">{message}</p>;
}
