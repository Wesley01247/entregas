import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const CARRIERS = ["J&T Express", "Shopee", "iMile", "Anjun", "Flash", "Total"];

/** As transportadoras são apenas identidade visual: não há seleção nem vínculo. */
function CarrierStrip() {
  return (
    <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6" aria-hidden="false">
      {CARRIERS.map((name) => (
        <div
          key={name}
          className="glass-card flex items-center justify-center px-2 py-2 text-center text-[11px] font-semibold tracking-wide text-muted-foreground"
        >
          {name}
        </div>
      ))}
    </div>
  );
}

export function AppHeader() {
  const { profile, isAdmin, isMainAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="glass-card rise-in mb-5 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-gradient text-2xl font-extrabold uppercase sm:text-3xl">Entregador</h1>
          <p className="text-sm text-muted-foreground">Meu financeiro</p>
          {profile ? (
            <p className="mt-1 text-sm font-semibold text-foreground">{profile.name}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="gradient-primary rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-foreground">
            {isAdmin ? (isMainAdmin ? "ADM / Programador" : "ADM") : "Entregador"}
          </span>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              void navigate({ to: "/auth" });
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted"
          >
            <LogOut className="size-3.5" /> Sair
          </button>
        </div>
      </div>
      <CarrierStrip />
    </header>
  );
}
