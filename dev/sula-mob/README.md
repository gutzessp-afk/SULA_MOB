# SULA MOB — Sistema de Gestión de Manufactura

Sistema web para seguimiento de producción por áreas, proyectos y actividades.

## Stack
- **Frontend:** Next.js 15 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend:** Supabase (PostgreSQL + Auth)
- **Deploy:** Vercel

## Arranque
```bash
npm install
cp .env.local.example .env.local   # llenar con credenciales de Supabase
npm run dev
```

## Estructura
```
src/
├── app/                    # Rutas (App Router)
│   ├── login/              # Acceso              → Dev 1
│   ├── home/               # Bienvenida          → Dev 1
│   ├── admin/              # Área administrador
│   │   ├── dashboard/      # Panel + KPIs        → Dev 2
│   │   ├── proyectos/      # CRUD proyectos      → Dev 2
│   │   ├── clientes/       # CRUD clientes       → Dev 2
│   │   ├── actividades/    # Vista global        → Dev 3
│   │   └── verificacion/   # Aprobar/rechazar    → Dev 3
│   └── operator/           # Área operador       → Dev 3
│       ├── dashboard/
│       └── actividades/
├── components/             # Componentes por dominio
│   ├── auth/               # → Dev 1
│   ├── layout/             # → Dev 1
│   ├── admin/              # → Dev 2
│   ├── operator/           # → Dev 3
│   └── ui/                 # shadcn/ui
└── lib/                    # supabase, tipos, auth, utils
```

## Reparto de trabajo
Ver documento "SULA_MOB_Reparticion_Equipo".

## Reglas de equipo
1. Trabajar en rama propia, fusionar a `main` solo cuando funcione.
2. `git pull` antes de empezar cada día.
3. `npm run build` antes de subir (no romper el deploy).
4. Acordar los tipos de `lib/types.ts` entre los 3 antes de codificar.
