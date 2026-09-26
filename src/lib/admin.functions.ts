import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "entregador" | "adm" | "adm_principal";

async function getRoles(supabase: any, userId: string): Promise<Role[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { role: Role }) => r.role);
}

function assertAdmin(roles: Role[]) {
  if (!roles.includes("adm") && !roles.includes("adm_principal")) {
    throw new Error("Acesso restrito aos administradores.");
  }
}

const periodSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  created_at: string;
  periodEntries: Array<{
    id: string;
    day: string;
    deliveries: number;
    price: number;
    extra_income: number;
    fuel: number;
    maintenance: number;
    other_expenses: number;
    notes: string;
    carrier: string;
  }>;
  allTime: { deliveries: number; value: number };
};

export const adminOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => periodSchema.parse(data))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    assertAdmin(roles);

    const [{ data: profiles, error: pErr }, { data: allRoles, error: rErr }] = await Promise.all([
      context.supabase.from("profiles").select("id, name, email, active, created_at"),
      context.supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) throw new Error(pErr.message);
    if (rErr) throw new Error(rErr.message);

    const { data: entries, error: eErr } = await context.supabase
      .from("entries")
      .select(
        "id, user_id, day, deliveries, price, extra_income, fuel, maintenance, other_expenses, notes, carrier",
      )
      .order("day", { ascending: false });
    if (eErr) throw new Error(eErr.message);

    const roleOf = (id: string): Role => {
      const list = (allRoles ?? []).filter((r: any) => r.user_id === id).map((r: any) => r.role);
      if (list.includes("adm_principal")) return "adm_principal";
      if (list.includes("adm")) return "adm";
      return "entregador";
    };

    const rows: AdminUserRow[] = (profiles ?? []).map((p: any) => {
      const mine = (entries ?? []).filter((e: any) => e.user_id === p.id);
      const allTime = mine.reduce(
        (acc: { deliveries: number; value: number }, e: any) => ({
          deliveries: acc.deliveries + Number(e.deliveries ?? 0),
          value: acc.value + Number(e.deliveries ?? 0) * Number(e.price ?? 0),
        }),
        { deliveries: 0, value: 0 },
      );
      return {
        id: p.id,
        name: p.name,
        email: p.email,
        role: roleOf(p.id),
        active: p.active,
        created_at: p.created_at,
        periodEntries: mine
          .filter((e: any) => e.day >= data.start && e.day <= data.end)
          .map(({ user_id: _ignored, ...rest }: any) => rest),
        allTime,
      };
    });

    return { rows, viewerRole: roleOf(context.userId) };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(6).max(72) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    assertAdmin(roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetRoles = await getRoles(context.supabase, data.userId);
    if (targetRoles.includes("adm_principal") && !roles.includes("adm_principal")) {
      throw new Error("Você não pode alterar o administrador principal.");
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    assertAdmin(roles);
    if (data.userId === context.userId) throw new Error("Você não pode excluir a própria conta.");
    const targetRoles = await getRoles(context.supabase, data.userId);
    if (targetRoles.includes("adm_principal")) {
      throw new Error("O administrador principal não pode ser excluído.");
    }
    if (targetRoles.includes("adm") && !roles.includes("adm_principal")) {
      throw new Error("Somente o administrador principal pode excluir outro ADM.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCreateDeliverer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(72),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    assertAdmin(roles);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, role: "entregador" },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCreateAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(72),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const roles = await getRoles(context.supabase, context.userId);
    if (!roles.includes("adm_principal")) {
      throw new Error("Somente o administrador principal pode criar novos ADMs.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, role: "adm" },
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
