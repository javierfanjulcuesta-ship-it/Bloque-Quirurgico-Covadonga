# QxFlow

Gestión del bloque quirúrgico del Hospital Ribera Covadonga.

## Demostración

Para enseñar la aplicación por perfiles (cirujano, endoscopista, anestesista, gestor, gestor/anestesista y gestión de citas) sin base de datos ni contraseñas, sigue **[DEMO.md](DEMO.md)**.

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) y elige un perfil. Los pacientes de la semana de ejemplo son ficticios.

## Producción

El despliegue con Postgres, autenticación y correo está descrito en [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md). No uses el proyecto ni las credenciales de producción para la demo.
