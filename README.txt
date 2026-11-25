PROTOTIPO - Formulario + Información (hoja de Google PRIVADA)

La web no lee la hoja directamente: lo hace una función de Netlify
(netlify/functions/datos.js) con una cuenta de servicio de Google.
La hoja solo se comparte con el email de esa cuenta.

CONFIGURACIÓN
1. Google Cloud: crear proyecto, activar "Google Sheets API",
   crear una cuenta de servicio y descargar su clave JSON.
2. Compartir la hoja (como Lector) con el client_email del JSON.
   Acceso general de la hoja: "Restringido".
3. Netlify > Site configuration > Environment variables:
     GOOGLE_CLIENT_EMAIL = client_email del JSON
     GOOGLE_PRIVATE_KEY  = private_key del JSON (completa)
     SHEET_ID            = ID de la hoja (entre /d/ y /edit)
     SHEET_TAB           = nombre de la pestaña (opcional)
4. Volver a desplegar el sitio.
5. Probar: https://TU-SITIO.netlify.app/.netlify/functions/datos

Cabecera de la hoja: Categoria | Opcion | Descripcion | Orden (opcional)

PRUEBA LOCAL SIN FUNCIÓN
En app.js pon CONFIG.MODO = "ejemplo" y ejecuta "python3 -m http.server".
Recuerda volver a "privado" antes de desplegar.
