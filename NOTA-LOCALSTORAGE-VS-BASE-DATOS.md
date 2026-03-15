# Sobre localStorage ahora y base de datos después

## Qué significa "seguir con localStorage"

Ahora mismo **todos los datos** (reservas, perfiles, notificaciones, mensajes al gestor, asignaciones de anestesistas, etc.) se guardan **solo en el navegador** (localStorage / sessionStorage). Eso sirve para:

- Desarrollar y probar la aplicación sin montar un servidor ni una base de datos.
- Ver cómo funciona cada perfil y cada pantalla.

**Limitación:** si cambias de ordenador, de navegador o borras datos del sitio, todo se pierde. No hay copia en un servidor.

## Qué sería "pasarnos a backend/base de datos"

Más adelante se puede:

- Tener un **servidor** (por ejemplo Node, .NET, etc.) y una **base de datos** (PostgreSQL, MySQL, etc.).
- Que las reservas, usuarios, asignaciones, etc. se **guarden y lean** desde ese servidor en lugar de desde localStorage.
- Así los datos son **compartidos** entre todos los usuarios y **persistentes** en el centro (hospital), no solo en un navegador.

## La frase que no quedaba clara

Cuando se dijo *"preparar la estructura para cambiar a API/base de datos"* se refería a:

- Escribir el código de la app de forma que, **cuando toque**, se pueda sustituir la lectura/escritura en localStorage por llamadas a un servidor (API), **sin rehacer toda la lógica** de pantallas y permisos.

Por ahora **no hace falta** que lo prepares tú: seguimos con localStorage para desarrollo y pruebas. Cuando quieras dar el paso a servidor y base de datos, se puede hacer el cambio en esa capa (por ejemplo un único “repositorio” o servicio de datos) y el resto de la aplicación puede seguir igual.
