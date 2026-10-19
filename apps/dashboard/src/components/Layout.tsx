import { NavLink, Outlet, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { useAuth } from "../lib/auth";
import { config } from "../lib/config";
import { Button } from "./ui";

function DemoBanner() {
  if (config.demoMisconfigured) {
    return (
      <div className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">
        MISCONFIGURED: demo mode is enabled in a production build. Showing MOCK
        data. Set VITE_DEMO_MODE=false and rebuild.
      </div>
    );
  }
  if (config.demoMode) {
    return (
      <div className="bg-amber-500/90 px-4 py-2 text-center text-sm font-semibold text-slate-950">
        DEMO MODE — all data on screen is fabricated mock data. No real devices
        are connected.
      </div>
    );
  }
  return null;
}

export function Layout() {
  const { owner, logout } = useAuth();
  const navigate = useNavigate();
  const nav = [
    { to: "/devices", label: "Devices" },
    { to: "/pair", label: "Pair device" },
    { to: "/audit", label: "Audit log" },
  ];
  return (
    <div className="min-h-full">
      <DemoBanner />
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold tracking-tight">
              Personal Device Manager
            </span>
            <nav className="hidden gap-1 sm:flex">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={({ isActive }) =>
                    clsx(
                      "rounded-md px-3 py-1.5 text-sm",
                      isActive
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-slate-200",
                    )
                  }
                >
                  {n.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-400 sm:inline">
              {owner?.email}
            </span>
            <Button
              variant="ghost"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
