# Actualizar la copia local

Sirve para una copia en Windows que ya tiene este repositorio. Trae `origin/hardening/integration` sin borrar el trabajo local y sin tocar `CREDENCIALES.txt`.

Los PR en borrador no están en esa rama. Siguen abiertos, en el orden de `docs/REVISION_PRS.md`, hasta que alguien los integre. Actualizar la copia no los fusiona.

## 1. Respaldo

Abra PowerShell en la carpeta del repositorio. Estos mismos comandos valen en Git Bash.

```powershell
git status
git branch respaldo-local
```

`respaldo-local` señala el commit en el que está ahora. Si ese nombre ya existe, use otro, por ejemplo `respaldo-local-2`.

Si `git status` lista ficheros modificados, guárdelos aparte del commit:

```powershell
git stash push -u -m "copia local antes de actualizar"
```

No use `git stash --all` ni `git clean`. Esos comandos pueden llevarse ficheros ignorados, y `CREDENCIALES.txt` está ignorado. No lo borre, no lo abra para copiarlo a otro fichero del repo y no lo añada con `git add`.

## 2. Traer la rama de integración

```powershell
git fetch origin hardening/integration
git checkout hardening/integration
git pull origin hardening/integration
```

Si `git checkout` se niega porque aún hay cambios, vuelva al paso del stash. No use `git reset --hard` para saltarse el respaldo.

Si `git pull` habla de commits locales en `hardening/integration`, no los borre. `respaldo-local` se creó antes y sigue señalando ese punto.

## 3. Recuperar lo suyo

Si hizo stash:

```powershell
git stash pop
```

Si Git marca conflictos, los ficheros quedan a medias y hay que resolverlos a mano. No descarte el stash hasta ver que lo suyo sigue.

Compruebe que las credenciales no han entrado en git:

```powershell
git check-ignore -v CREDENCIALES.txt
git status
```

La primera línea tiene que citar `.gitignore`. `git status` no tiene que listar `CREDENCIALES.txt`. Si lo lista, no lo confirme en un commit.

## 4. Qué queda fuera

`hardening/integration` no contiene los PR 130 en adelante. Para mirar un borrador, cambie a la rama de ese PR, no mezcle la cadena a mano. El orden y el riesgo de cada uno están en `docs/REVISION_PRS.md`.

No lance `db:seed`, `usuarios:prueba` ni `seed:showcase` contra la base de Vercel. No ponga en el entorno `STORE_PATIENT_IDENTITY`.
