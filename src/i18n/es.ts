// Spanish (Español). Each line is: "English text exactly as on the page": "Spanish".
// Words in {curly brackets} are filled in by the page and must be kept as they are.
// Stars mark the coloured words in a heading. Anything missing shows in English.
// Uses "usted", the polite form. Please ask a native speaker to check new lines.

const es: Record<string, string> = {
  // ----- Shared: header, footer, menus -----
  "About Us": "Quiénes somos",
  "Sign in": "Iniciar sesión",
  "Phone camera": "Cámara del teléfono",
  Family: "Familia",
  "Care profile": "Perfil de cuidado",
  Language: "Idioma",
  "Open menu": "Abrir menú",
  "Close menu": "Cerrar menú",
  "Back to top": "Volver arriba",
  "Skip to main content": "Ir al contenido principal",
  "Only the people you invite can see anything.": "Solo las personas que usted invite pueden ver algo.",
  Live: "En directo",
  "Loading…": "Cargando…",
  "Page not found": "Página no encontrada",
  "Family page": "Página familiar",
  "Something went wrong": "Algo salió mal",
  "Sorry, this page stopped working. Reloading usually fixes it.":
    "Lo sentimos, esta página dejó de funcionar. Volver a cargarla suele solucionarlo.",
  Reload: "Volver a cargar",
  "Go to the homepage": "Ir a la página de inicio",
  "Sorry, we can't find that page": "Lo sentimos, no encontramos esa página",
  "The page may have moved. Let's take you back to the start.":
    "Puede que la página haya cambiado de lugar. Le llevamos de vuelta al inicio.",
  "Go to About Us": "Ir a Quiénes somos",

  // ----- About Us page -----
  "Stay close to the people you love, *even from far away*.":
    "Siga cerca de las personas que quiere, *aunque estén lejos*.",
  "CareNest turns a spare phone on the table into a gentle helper. It notices movement in the room, and family can see on their own phone that all is well — so Grandma can stay independent at home.":
    "CareNest convierte un teléfono que no usa, puesto sobre una mesa, en un ayudante discreto. Nota el movimiento en la habitación y la familia puede ver en su propio teléfono que todo va bien, para que la abuela siga viviendo en su casa con independencia.",
  "Get started": "Empezar",
  "Try the family page below": "Pruebe la página familiar aquí abajo",
  "Mum is okay": "Mamá está bien",
  "Mum is resting": "Mamá está descansando",
  "Moving about": "Moviéndose",
  "Left side of room": "Lado izquierdo de la habitación",
  "Why families choose CareNest": "Por qué las familias eligen CareNest",
  "Just a phone on a table": "Solo un teléfono sobre una mesa",
  "Nothing to wear": "Nada que llevar puesto",
  "Video stays on the phone": "El vídeo se queda en el teléfono",
  "Only invited family can see": "Solo la familia invitada puede verlo",
  "Updates by itself": "Se actualiza sola",
  "Fall & quiet alerts": "Avisos de caídas y de silencio",
  "Big, plain words": "Letra grande y palabras sencillas",
  "How it *works*": "Cómo *funciona*",
  "From a phone on the table to an update on your phone.": "De un teléfono sobre la mesa a un aviso en su teléfono.",
  "Step {n}": "Paso {n}",
  "Stand a phone on a table": "Ponga un teléfono sobre una mesa",
  "Put a phone on a table where it can see the room. Nothing to wear, nothing to charge on the wrist.":
    "Ponga un teléfono sobre una mesa desde donde vea la habitación. Nada que llevar puesto ni que cargar en la muñeca.",
  "CareNest watches for movement": "CareNest se fija en el movimiento",
  "The phone notices if someone is moving, sitting still, or may have fallen, and which side of the room they are in.":
    "El teléfono nota si alguien se mueve, está sentado o puede haberse caído, y en qué lado de la habitación está.",
  "Family sees how things are": "La familia ve cómo van las cosas",
  "Family open the CareNest family page and see, in plain words, what is happening right now.":
    "La familia abre la página familiar de CareNest y ve, con palabras sencillas, lo que pasa en este momento.",
  "Keep playing the steps": "Seguir mostrando los pasos",
  "Little helpers, *big comfort*": "Pequeñas ayudas, *gran tranquilidad*",
  "Made to be simple for everyone — grandparents included.": "Pensado para que sea fácil para todos, abuelos incluidos.",
  "If the phone thinks someone may have fallen, or it stops checking in, the family page says so in big letters.":
    "Si el teléfono cree que alguien puede haberse caído, o deja de dar señales, la página familiar lo dice en letra grande.",
  "The camera picture never leaves the phone. Only short notes like “moving around, left side” are sent.":
    "La imagen de la cámara nunca sale del teléfono. Solo se envían notas cortas como «moviéndose, lado izquierdo».",
  "One simple page shows what is happening right now and a short list of today’s news.":
    "Una página sencilla muestra lo que pasa ahora mismo y una lista corta con las novedades de hoy.",
  "The family page changes the moment something happens. No need to reload or ring round.":
    "La página familiar cambia en cuanto pasa algo. No hace falta volver a cargarla ni llamar a todos.",
  "Try it yourself": "Pruébelo usted",
  "See the family page *come alive*": "Vea la página familiar *en acción*",
  "Tap a button to play out Grandma’s morning and watch the family page update by itself. This is a pretend demo — no camera needed.":
    "Toque un botón para simular la mañana de la abuela y vea cómo la página familiar se actualiza sola. Es solo una demostración, no hace falta cámara.",
  "Left side": "Lado izquierdo",
  "Right side": "Lado derecho",
  "Walk to the left": "Caminar a la izquierda",
  "Walk to the right": "Caminar a la derecha",
  "Sit down": "Sentarse",
  "Possible fall": "Posible caída",
  "Up and about": "De pie otra vez",
  "Pause demo": "Pausar la demostración",
  "Play demo": "Ver la demostración",
  "All is well": "Todo va bien",
  Resting: "Descansando",
  "Sitting still": "Sentado, sin moverse",
  "Please check in": "Por favor, compruebe",
  "May have fallen": "Puede haberse caído",
  left: "izquierdo",
  right: "derecho",
  "{detail}, {side} side": "{detail}, lado {side}",
  "Moving around, {side} side": "Moviéndose, lado {side}",
  "Sitting still, {side} side": "Sentado, lado {side}",
  "May have fallen, {side} side": "Puede haberse caído, lado {side}",
  "Up and moving again, {side} side": "Otra vez en movimiento, lado {side}",
  "Grandma right now: {label}. {detail}, {side} side.": "La abuela ahora: {label}. {detail}, lado {side}.",
  "Grandma · right now": "La abuela · ahora",
  "Updated {time}": "Actualizado a las {time}",
  "Today’s news": "Novedades de hoy",
  "Seen by {n}": "Lo ven {n}",
  "Everyone in the *loop*": "Toda la familia, *al tanto*",
  "Add children, grandchildren, neighbours or a carer to your CareNest home. Everyone sees the same simple update, so nobody has to ring round to check.":
    "Añada a hijos, nietos, vecinos o a un cuidador a su hogar en CareNest. Todos ven el mismo aviso sencillo, así nadie tiene que llamar a los demás para preguntar.",
  "Who would you invite?": "¿A quién invitaría?",
  Daughter: "Hija",
  Grandson: "Nieto",
  Neighbour: "Vecina",
  Carer: "Cuidador",
  "Invite someone to share the updates": "Invite a alguien para compartir los avisos",
  "1 person sees the same update": "1 persona ve el mismo aviso",
  "{n} people see the same update": "{n} personas ven el mismo aviso",
  "Who we are": "Quiénes somos",
  "We are a small hackathon team. Many of us have parents and grandparents who live alone, and we wanted a simple, kind way to stay close without cameras sending pictures anywhere or gadgets to wear.":
    "Somos un pequeño equipo de un hackatón. Muchos tenemos padres y abuelos que viven solos, y queríamos una forma sencilla y amable de estar cerca, sin cámaras que envíen imágenes a ningún sitio ni aparatos que llevar puestos.",
  "Good questions": "Preguntas frecuentes",
  "Does any video leave the phone?": "¿Sale algún vídeo del teléfono?",
  "No. The camera picture never leaves the phone. Only short notes like “moving around, left side” are sent to your family page.":
    "No. La imagen de la cámara nunca sale del teléfono. Solo se envían notas cortas como «moviéndose, lado izquierdo» a su página familiar.",
  "What do I need to get started?": "¿Qué necesito para empezar?",
  "Just a spare phone standing on a table where it can see the room. Nothing to wear, nothing to charge on the wrist.":
    "Solo un teléfono que no use, de pie sobre una mesa desde donde vea la habitación. Nada que llevar puesto ni que cargar en la muñeca.",
  "Who can see what is happening?": "¿Quién puede ver lo que pasa?",
  "Only the people you invite — children, grandchildren, neighbours or a carer. Everyone sees the same simple update.":
    "Solo las personas que usted invite: hijos, nietos, vecinos o un cuidador. Todos ven el mismo aviso sencillo.",
  "What happens if something seems wrong?": "¿Qué pasa si algo parece ir mal?",
  "If the phone thinks someone may have fallen, or it stops checking in, the family page says so in big letters — no need to reload.":
    "Si el teléfono cree que alguien puede haberse caído, o deja de dar señales, la página familiar lo dice en letra grande, sin necesidad de volver a cargarla.",
  "Ready to feel closer?": "¿Listo para sentirse más cerca?",
  "Make an account, stand a phone on the table and press “Start watching”.":
    "Cree una cuenta, ponga un teléfono sobre la mesa y pulse «Empezar a vigilar».",

  // ----- Log in, sign up and new password -----
  "Welcome back": "Hola de nuevo",
  "Create your account": "Cree su cuenta",
  "Reset your password": "Cambie su contraseña",
  "Check your email": "Revise su correo",
  "Log in to see how your family is doing.": "Inicie sesión para ver cómo está su familia.",
  "It only takes a minute. You can invite family afterwards.": "Solo lleva un minuto. Después puede invitar a su familia.",
  "Type your email and we'll send you a link to choose a new password.":
    "Escriba su correo y le enviaremos un enlace para elegir una contraseña nueva.",
  "Log in": "Iniciar sesión",
  "Create account": "Crear cuenta",
  "Send me the link": "Enviarme el enlace",
  "Email address": "Correo electrónico",
  Password: "Contraseña",
  "New password": "Contraseña nueva",
  "At least 6 letters or numbers.": "Al menos 6 letras o números.",
  "Show password": "Mostrar contraseña",
  "Forgot your password?": "¿Olvidó su contraseña?",
  "Please wait…": "Espere, por favor…",
  "New to CareNest?": "¿Es nuevo en CareNest?",
  "Create an account": "Crear una cuenta",
  "Already have an account?": "¿Ya tiene una cuenta?",
  "Log in instead": "Iniciar sesión",
  "Back to log in": "Volver a iniciar sesión",
  "You've logged out. See you soon!": "Ha cerrado la sesión. ¡Hasta pronto!",
  "We've sent an email to {email}. Open it and tap the link inside to finish creating your account.":
    "Hemos enviado un correo a {email}. Ábralo y toque el enlace que contiene para terminar de crear su cuenta.",
  "If there's an account for {email}, we've sent it an email. Open it and tap the link inside to choose a new password.":
    "Si existe una cuenta con {email}, le hemos enviado un correo. Ábralo y toque el enlace que contiene para elegir una contraseña nueva.",
  "Can't find it?": "¿No lo encuentra?",
  "It can take a few minutes to arrive. Look in your spam or junk folder too.":
    "Puede tardar unos minutos en llegar. Mire también en la carpeta de correo no deseado.",
  "Please type your email address.": "Escriba su correo electrónico, por favor.",
  "That doesn't look like an email address. It should look like name@example.com.":
    "Eso no parece un correo electrónico. Debería ser algo como nombre@ejemplo.com.",
  "Please type your password.": "Escriba su contraseña, por favor.",
  "Please type a new password.": "Escriba una contraseña nueva, por favor.",
  "Please choose a password with at least 6 letters or numbers.":
    "Elija una contraseña de al menos 6 letras o números, por favor.",
  "There is already an account with this email. Try logging in instead.":
    "Ya hay una cuenta con este correo. Pruebe a iniciar sesión.",
  "That email and password don't match. Please check them and try again.":
    "El correo y la contraseña no coinciden. Revíselos y vuelva a intentarlo.",
  "Please confirm your email first. Look in your inbox for our message and tap the link inside.":
    "Primero confirme su correo. Busque nuestro mensaje en su bandeja de entrada y toque el enlace que contiene.",
  "Your new password must be different from your old one.": "La contraseña nueva debe ser distinta de la anterior.",
  "Please choose a longer password, with at least 6 letters or numbers.":
    "Elija una contraseña más larga, de al menos 6 letras o números, por favor.",
  "We've had a lot of tries just now. Please wait a few minutes, then try again.":
    "Ha habido muchos intentos seguidos. Espere unos minutos y vuelva a intentarlo.",
  "Sorry, we can't send emails from CareNest yet. Please contact the CareNest team for help.":
    "Lo sentimos, CareNest todavía no puede enviar correos. Póngase en contacto con el equipo de CareNest para pedir ayuda.",
  "We can't use that email address. Please check it, or try a different one.":
    "No podemos usar ese correo. Revíselo o pruebe con otro.",
  "That email link has run out or was already used. Please try logging in, or ask us for a new link.":
    "Ese enlace ha caducado o ya se usó. Pruebe a iniciar sesión o pídanos un enlace nuevo.",
  "We couldn't connect. Please check your internet connection and try again.":
    "No pudimos conectar. Revise su conexión a internet y vuelva a intentarlo.",
  "Sorry, something went wrong. Please try again.": "Lo sentimos, algo salió mal. Vuelva a intentarlo.",
  "Logging in isn't ready yet": "Iniciar sesión todavía no está disponible",
  "We're still setting this part up. Please try again a little later — sorry for the wait!":
    "Todavía estamos preparando esta parte. Vuelva a intentarlo un poco más tarde. ¡Perdone la espera!",
  "Back to the homepage": "Volver a la página de inicio",
  "Choose a new password": "Elija una contraseña nueva",
  "This link has run out": "Este enlace ha caducado",
  "Checking your link…": "Comprobando su enlace…",
  "The link in your email has run out or was already used. That's okay — you can ask for a new one.":
    "El enlace de su correo ha caducado o ya se usó. No pasa nada: puede pedir uno nuevo.",
  "To choose a new password, please open the link from the email we sent you, or ask for a new one.":
    "Para elegir una contraseña nueva, abra el enlace del correo que le enviamos o pida uno nuevo.",
  "Send me a new link": "Enviarme un enlace nuevo",
  "Type a new password below. Make it something you will remember.":
    "Escriba abajo una contraseña nueva. Elija una que pueda recordar.",
  "Save new password": "Guardar la contraseña nueva",

  // ----- Family page -----
  "Your family": "Su familia",
  "Family *page*": "Página *familiar*",
  "Signed in as": "Ha iniciado sesión como",
  "Log out": "Cerrar sesión",
  "Logging out…": "Cerrando sesión…",
  "Your new password is saved.": "Su contraseña nueva se ha guardado.",
  "Sorry, we couldn't log you out. Please check your internet connection and try again.":
    "Lo sentimos, no pudimos cerrar su sesión. Revise su conexión a internet y vuelva a intentarlo.",
  "We couldn't reach the database. Please check your internet and reload the page.":
    "No pudimos conectar con la base de datos. Revise su internet y vuelva a cargar la página.",
  "Your account has no care circle yet. Has the database been set up? See the README.":
    "Su cuenta todavía no tiene un círculo de cuidado. ¿Se ha preparado la base de datos? Consulte el README.",
  "We couldn't load the latest news. Please reload the page.":
    "No pudimos cargar las últimas novedades. Vuelva a cargar la página.",
  "Right now": "Ahora mismo",
  "Connecting…": "Conectando…",
  "No news yet": "Todavía no hay novedades",
  "The phone thinks someone may have fallen. Please call or visit to check they are okay.":
    "El teléfono cree que alguien puede haberse caído. Llame o vaya a verle para comprobar que está bien.",
  "The phone last checked in {when}.": "El teléfono dio señales por última vez {when}.",
  'Check that it is switched on, charging, and showing the "Camera on" sign.':
    "Compruebe que está encendido, cargando y mostrando el aviso «Cámara encendida».",
  "Stand a phone on a table, sign in on it with this account, open":
    "Ponga un teléfono sobre una mesa, inicie sesión en él con esta cuenta, abra",
  'and press "Start watching". News will appear here by itself.':
    "y pulse «Empezar a vigilar». Las novedades aparecerán aquí solas.",
  "This page updates by itself.": "Esta página se actualiza sola.",
  "Connecting for live updates…": "Conectando para recibir avisos en directo…",
  "Recent news": "Novedades recientes",
  "Moving around": "Moviéndose",
  "Lying down, resting": "Tumbado, descansando",
  "Standing still": "De pie, sin moverse",
  "Nobody in view": "No se ve a nadie",
  "Phone is watching": "El teléfono está vigilando",
  "Phone started watching": "El teléfono empezó a vigilar",
  "Phone stopped watching": "El teléfono dejó de vigilar",
  "left side": "lado izquierdo",
  "middle of the room": "centro de la habitación",
  "right side": "lado derecho",
  "just now": "ahora mismo",
  "1 minute ago": "hace 1 minuto",
  "{n} minutes ago": "hace {n} minutos",
  "1 hour ago": "hace 1 hora",
  "{n} hours ago": "hace {n} horas",
  "1 day ago": "hace 1 día",
  "{n} days ago": "hace {n} días",
  "Add a family member": "Añadir a un familiar",
  "They need their own CareNest account first. Then type their email here.":
    "Primero necesita su propia cuenta de CareNest. Después escriba aquí su correo.",
  "Their email": "Su correo electrónico",
  "Add to family": "Añadir a la familia",
  "Adding…": "Añadiendo…",
  "Sorry, that didn't work. Please try again.": "Lo sentimos, no ha funcionado. Vuelva a intentarlo.",
  "If that person has a CareNest account, they can now see this family page.":
    "Si esa persona tiene una cuenta de CareNest, ya puede ver esta página familiar.",

  "The Call buttons are just below.": "Los botones para llamar están justo debajo.",
  Call: "Llamar",
  "Call {name}": "Llamar a {name}",
  them: "esta persona",
  "emergency contact": "contacto de emergencia",
  "Change numbers": "Cambiar números",
  "Add a phone number, so you can ring them (or an emergency contact) with one tap from this page.":
    "Añada un número de teléfono para poder llamarle (o a un contacto de emergencia) con un solo toque desde esta página.",
  "Add a phone number": "Añadir un número de teléfono",
  "The person you care for": "La persona a la que cuida",
  "Their name": "Su nombre",
  "For example: Mum": "Por ejemplo: Mamá",
  "Their phone number": "Su número de teléfono",
  "Emergency contact (optional)": "Contacto de emergencia (opcional)",
  Name: "Nombre",
  "For example: Neighbour Sam": "Por ejemplo: la vecina Carmen",
  "Phone number": "Número de teléfono",
  "That doesn't look like a phone number. Please use only numbers, spaces and a + sign.":
    "Eso no parece un número de teléfono. Use solo números, espacios y el signo +.",
  "Saved in this browser only. To remove a number, clear the box and save.":
    "Se guarda solo en este navegador. Para quitar un número, borre la casilla y guarde.",
  "Save numbers": "Guardar números",
  Cancel: "Cancelar",
  "Today so *far*": "Hoy, *hasta ahora*",
  "Nothing from the phone camera yet today. A short summary of the day will build up here once it starts watching.":
    "Todavía no hay nada de la cámara del teléfono hoy. Aquí irá apareciendo un breve resumen del día cuando empiece a vigilar.",
  "Up and moving at {time}.": "En movimiento desde las {time}.",
  "Up and about at {time}.": "Levantado desde las {time}.",
  "Most active {when}.": "Más activo {when}.",
  "in the morning": "por la mañana",
  "in the afternoon": "por la tarde",
  "in the evening": "al anochecer",
  "at night": "por la noche",
  "One possible fall, at {times}. Please check they are okay.":
    "Una posible caída, a las {times}. Compruebe que está bien, por favor.",
  "{n} possible falls, at {times}. Please check they are okay.":
    "{n} posibles caídas, a las {times}. Compruebe que está bien, por favor.",
  "No possible falls today.": "Hoy no ha habido posibles caídas.",
  "Out of the camera's view once.": "Fuera de la vista de la cámara una vez.",
  "Out of the camera's view {n} times.": "Fuera de la vista de la cámara {n} veces.",
  "Quiet since {time}.": "Sin movimiento desde las {time}.",
  "Last news: {what} at {time}.": "Última novedad: {what} a las {time}.",

  // ----- Display settings -----
  Display: "Pantalla",
  settings: "ajustes",
  "Display settings": "Ajustes de pantalla",
  "Text size": "Tamaño del texto",
  Normal: "Normal",
  Large: "Grande",
  "Extra large": "Muy grande",
  Color: "Color",
  "Pick the colors you like best.": "Elija los colores que más le gusten.",
  "CareNest purple": "Morado CareNest",
  "Ocean blue": "Azul océano",
  "Forest green": "Verde bosque",
  "Sunset orange": "Naranja atardecer",
  "Rose pink": "Rosa",
  "Slate gray": "Gris pizarra",
  "High contrast": "Alto contraste",
  "Black text on white, with strong edges.": "Texto negro sobre blanco, con bordes marcados.",
  "Reduce motion": "Reducir movimiento",
  "Turns off moving and sliding effects.": "Quita los efectos de movimiento y deslizamiento.",
  On: "Sí",
  Off: "No",
  Done: "Listo",
  "Saved in this browser.": "Se guarda en este navegador.",

  // ----- Family page tools: read aloud, simple view, "I'm checking on it", alerts -----
  Help: "Ayuda",
  "Need help?": "¿Necesita ayuda?",
  "Your account": "Su cuenta",
  "You're offline. Check your Wi-Fi or mobile data; the page will catch up when you're back online.":
    "No tiene conexión. Revise su wifi o sus datos móviles; la página se pondrá al día cuando vuelva a conectarse.",
  "Read aloud": "Leer en voz alta",
  "Stop reading": "Dejar de leer",
  "This device has no voice for this language, so it can't read this aloud.":
    "Este dispositivo no tiene una voz en español, así que no puede leerlo en voz alta.",
  "Simple view": "Vista sencilla",
  "Show everything": "Mostrar todo",
  "Your loved one": "Su ser querido",
  "There is no news from the phone yet.": "Todavía no hay novedades del teléfono.",
  "The phone thinks {who} may have fallen, at {at}. Please call or visit to check they are okay.":
    "El teléfono cree que {who} puede haberse caído, a las {at}. Llame o vaya a verle para comprobar que está bien.",
  "The phone has not checked in since {at}. Please check it is switched on and charging.":
    "El teléfono no da señales desde las {at}. Compruebe que está encendido y cargando.",
  "The phone stopped watching at {at}.": "El teléfono dejó de vigilar a las {at}.",
  "The phone started watching at {at}.": "El teléfono empezó a vigilar a las {at}.",
  "Nobody is in view of the phone. Last update at {at}.": "El teléfono no ve a nadie. Última actualización a las {at}.",
  "{who} is okay, {activity}. Last update at {at}.": "{who} está bien, {activity}. Última actualización a las {at}.",
  "moving about": "moviéndose",
  "lying down, resting": "tumbado, descansando",
  "standing still": "de pie, sin moverse",
  "sitting still": "sentado, sin moverse",
  "{what}, at {at}.": "{what}, a las {at}.",
  "Needs a look:": "Conviene revisarlo:",
  "During quiet hours": "Durante las horas de descanso",
  "I'm checking on it": "Yo me encargo de comprobarlo",
  "Telling the family…": "Avisando a la familia…",
  You: "Usted",
  Someone: "Alguien",
  "Someone in the family": "Alguien de la familia",
  "You are checking on it": "Usted lo está comprobando",
  "{name} is checking on it": "{name} lo está comprobando",
  "{names} are checking on it": "{names} lo están comprobando",
  "{first} and {last}": "{first} y {last}",
  "Sorry, this button isn't switched on yet. Please phone or message the family instead. (Whoever set up CareNest needs to run the newest database update.)":
    "Lo sentimos, este botón todavía no está activado. Llame o escriba a la familia. (Quien configuró CareNest tiene que aplicar la última actualización de la base de datos.)",
  "Sorry, that didn't work. Please check your internet and try again.":
    "Lo sentimos, no ha funcionado. Revise su internet y vuelva a intentarlo.",
  "Alert settings": "Ajustes de avisos",
  "Choose which news stands out in Recent news. Saved on this device only.":
    "Elija qué novedades se destacan en Novedades recientes. Se guarda solo en este dispositivo.",
  "Highlight these": "Destacar estas",
  "Possible falls": "Posibles caídas",
  "Out of sight (nobody in view of the phone)": "Fuera de la vista (el teléfono no ve a nadie)",
  "Quiet hours": "Horas de descanso",
  "Tone down highlights at night": "Suavizar los avisos por la noche",
  From: "Desde",
  Until: "Hasta",
  'A possible fall always shows in "Right now", even in quiet hours.':
    "Una posible caída siempre aparece en «Ahora mismo», también en las horas de descanso.",
  "Alerts by phone message or email are coming later.": "Los avisos por mensaje o correo electrónico llegarán más adelante.",

  // ----- Care profile -----
  "About {name}": "Sobre {name}",
  "About your loved one": "Sobre su ser querido",
  "Care *profile*": "Perfil *de cuidado*",
  "A few quick questions help us know when to keep a closer eye out.":
    "Unas preguntas rápidas nos ayudan a saber cuándo estar más atentos.",
  "Question {number} of {total}": "Pregunta {number} de {total}",
  Progress: "Progreso",
  Back: "Atrás",
  Next: "Siguiente",
  Skip: "Saltar",
  "See the summary": "Ver el resumen",
  "What do you call them?": "¿Cómo le llama?",
  "Just so the page feels personal. You can skip this.": "Solo para que la página sea más personal. Puede saltarse esta pregunta.",
  "For example: Mum, Grandpa Joe": "Por ejemplo: Mamá, abuelo José",
  "How old are they?": "¿Qué edad tiene?",
  "Under 65": "Menos de 65",
  "65 to 74": "De 65 a 74",
  "75 to 84": "De 75 a 84",
  "85 or older": "85 o más",
  "Falls get more common after 65.": "Las caídas son más frecuentes a partir de los 65.",
  "Falls get more common with age, especially after 75.":
    "Las caídas son más frecuentes con la edad, sobre todo a partir de los 75.",
  "Falls are most common after 85.": "Las caídas son mucho más frecuentes a partir de los 85.",
  "Who do they live with?": "¿Con quién vive?",
  "Someone lives with them": "Vive con alguien",
  "They live alone, but someone visits every day": "Vive solo, pero alguien le visita todos los días",
  "They are on their own for parts of the day.": "Pasa parte del día solo.",
  "They live alone": "Vive solo",
  "They live alone, so a fall might not be noticed quickly.": "Vive solo, así que una caída podría pasar desapercibida un tiempo.",
  "When do they usually wake up and go to bed?": "¿A qué hora suele levantarse y acostarse?",
  "A rough guess is fine.": "Basta con una hora aproximada.",
  "Wakes up around": "Se levanta hacia las",
  "Goes to bed around": "Se acuesta hacia las",
  "When are they usually on their own at home?": "¿Cuándo suele estar solo en casa?",
  "Pick all that apply.": "Elija todas las que correspondan.",
  Mornings: "Por la mañana",
  Afternoons: "Por la tarde",
  Evenings: "Al anochecer",
  Overnight: "Por la noche",
  "Hardly ever": "Casi nunca",
  "How often do they get up in the night?": "¿Cuántas veces se levanta por la noche?",
  "For example, to use the bathroom.": "Por ejemplo, para ir al baño.",
  "Rarely or never": "Casi nunca o nunca",
  "About once a night": "Más o menos una vez por noche",
  "Two or more times a night": "Dos o más veces por noche",
  "They get up in the night, when it is dark and they are sleepy.":
    "Se levanta por la noche, cuando está oscuro y tiene sueño.",
  "They get up several times a night, when it is dark and they are sleepy.":
    "Se levanta varias veces por la noche, cuando está oscuro y tiene sueño.",
  "Have they fallen in the past year?": "¿Se ha caído en el último año?",
  No: "No",
  Once: "Una vez",
  "More than once": "Más de una vez",
  "They have fallen in the past year.": "Se ha caído en el último año.",
  "They have fallen more than once in the past year.": "Se ha caído más de una vez en el último año.",
  "Do they use anything to help them walk?": "¿Usa algo que le ayude a caminar?",
  "No, nothing": "No, nada",
  "A walking stick": "Un bastón",
  "A walking frame": "Un andador",
  "A wheelchair": "Una silla de ruedas",
  "They use a walking stick.": "Usa bastón.",
  "They use a walking frame.": "Usa andador.",
  "Getting in and out of a wheelchair can lead to falls.": "Sentarse y levantarse de la silla de ruedas puede provocar caídas.",
  "Do they take 4 or more different medicines a day?": "¿Toma 4 o más medicamentos distintos al día?",
  "Some medicines can cause dizziness.": "Algunos medicamentos pueden causar mareos.",
  "Not sure": "No estoy seguro",
  Yes: "Sí",
  "Taking several medicines can cause dizziness.": "Tomar varios medicamentos puede causar mareos.",
  "Chance of a fall": "Probabilidad de caída",
  Lower: "Baja",
  Medium: "Media",
  Higher: "Alta",
  Why: "Por qué",
  "Nothing in the answers points to a higher chance. That's good news!":
    "Nada en las respuestas indica una probabilidad más alta. ¡Es una buena noticia!",
  "This is a rough guide, not medical advice. If you're worried, talk to their doctor.":
    "Es solo una guía aproximada, no un consejo médico. Si le preocupa, hable con su médico.",
  "Times to keep an *eye on*": "Momentos para *estar atentos*",
  "Overnight ({bed} to {wake}), when they get up": "Por la noche (de {bed} a {wake}), cuando se levanta",
  "Overnight, when they get up": "Por la noche, cuando se levanta",
  "The first hour after waking up (around {wake})": "La primera hora después de levantarse (hacia las {wake})",
  "Getting ready for bed (around {bed})": "Al prepararse para dormir (hacia las {bed})",
  "Mornings, when they are on their own": "Por la mañana, cuando está solo",
  "Afternoons, when they are on their own": "Por la tarde, cuando está solo",
  "Evenings, when they are on their own": "Al anochecer, cuando está solo",
  "{h}:{m} am": "{h}:{m} a. m.",
  "{h}:{m} pm": "{h}:{m} p. m.",
  "Your answers": "Sus respuestas",
  Change: "Cambiar",
  "Change: {question}": "Cambiar: {question}",
  "Start again": "Empezar de nuevo",
  Skipped: "Sin responder",

  // ----- Phone camera start screen -----
  "Phone *camera*": "Cámara *del teléfono*",
  "Stand this phone on a table, pointing at the room. It watches for movement and tells your family, in a few words, how things are going.":
    "Ponga este teléfono de pie sobre una mesa, mirando hacia la habitación. Se fija en el movimiento y le cuenta a su familia, en pocas palabras, cómo van las cosas.",
  'Video stays on this phone. Only short notes like "moving around - left side" are sent. No video or pictures ever leave it.':
    "El vídeo se queda en este teléfono. Solo se envían notas cortas como «moviéndose - lado izquierdo». Ningún vídeo ni foto sale nunca de él.",
  "Please sign in first, so your family can see the updates.":
    "Primero inicie sesión, para que su familia pueda ver los avisos.",
  "Start watching": "Empezar a vigilar",
  "Starting... (the first time takes a little longer)": "Empezando... (la primera vez tarda un poco más)",
  "The database isn't set up on this website yet, so you can try the camera but your family won't see anything.":
    "La base de datos de esta web todavía no está preparada: puede probar la cámara, pero su familia no verá nada.",
  "Have a motor stand? This browser can't use Bluetooth, so it can't move the stand. On iPhone, open this page in the Bluefy app.":
    "¿Tiene un soporte con motor? Este navegador no puede usar Bluetooth, así que no puede mover el soporte. En iPhone, abra esta página en la aplicación Bluefy.",

  // ----- Help page -----
  "Help and how-to": "Ayuda y guía",
  "Help and *how‑to*": "Ayuda y *guía*",
  "Getting started takes about five minutes. Here's how.": "Empezar lleva unos cinco minutos. Así se hace.",
  "Getting started": "Para empezar",
  "Set up the phone on a table": "Ponga el teléfono sobre una mesa",
  "Use a spare phone. Stand it up on a table or shelf where it can see most of the room, and keep it plugged in to charge.":
    "Use un teléfono que no necesite. Póngalo de pie sobre una mesa o estantería desde donde vea casi toda la habitación, y déjelo enchufado para que se cargue.",
  "On that phone, sign in and open": "En ese teléfono, inicie sesión y abra",
  ". ": ". ",
  "Press \"Start watching\". A green \"Camera on\" sign stays on the screen while it works.":
    "Pulse «Empezar a vigilar». Mientras funciona, verá en la pantalla el aviso verde «Cámara encendida».",
  "Add your family": "Añada a su familia",
  "Each person makes their own CareNest account first. Then, on the":
    "Primero, cada persona crea su propia cuenta de CareNest. Después, en la",
  ", type their email under \"Add a family member\". They will see the same news.":
    ", escriba su correo en «Añadir a un familiar». Verán las mismas noticias.",
  "What the news means": "Qué significan las noticias",
  "Green means all is well, like \"Moving around\". Red means the phone thinks someone may have fallen: please call or visit. A white box means the phone hasn't checked in for a few minutes — check it is on and charging.":
    "Verde quiere decir que todo va bien, por ejemplo «Moviéndose». Rojo quiere decir que el teléfono cree que alguien puede haberse caído: llame o vaya a verle, por favor. Un recuadro blanco quiere decir que el teléfono no ha dado noticias desde hace unos minutos: compruebe que está encendido y cargando.",
  "Your privacy": "Su privacidad",
  "Video and pictures never leave the phone. Family only get short notes in words, like \"Sitting still - left side\". Only the people you add can see them.":
    "El vídeo y las fotos nunca salen del teléfono. La familia solo recibe notas cortas con palabras, como «Sentado, sin moverse - lado izquierdo». Solo las personas que usted añada pueden verlas.",
  "Common questions": "Preguntas frecuentes",
  "Does CareNest record video?": "¿CareNest graba vídeo?",
  "No. The phone looks at the room itself and only sends short words, like \"Moving around\". No video or pictures are sent or saved anywhere.":
    "No. El propio teléfono mira la habitación y solo envía unas pocas palabras, como «Moviéndose». No se envía ni se guarda ningún vídeo ni ninguna foto.",
  "Which phone can I use?": "¿Qué teléfono puedo usar?",
  "Most smartphones from the last few years work. It needs a working camera, Wi-Fi or mobile data, and a charger.":
    "Sirven la mayoría de los teléfonos inteligentes de los últimos años. Necesita una cámara que funcione, wifi o datos móviles, y un cargador.",
  "What happens if the phone thinks someone has fallen?": "¿Qué pasa si el teléfono cree que alguien se ha caído?",
  "The \"Right now\" box on the Family page turns red and asks you to call or visit. CareNest does not call emergency services, so if you can't reach them, call someone nearby or the emergency number.":
    "El recuadro «Ahora mismo» de la Página familiar se pone rojo y le pide que llame o vaya a verle. CareNest no llama a los servicios de emergencia, así que si no consigue hablar con la persona, llame a alguien que esté cerca o al número de emergencias.",
  "The Family page says the phone hasn't checked in. What do I do?":
    "La Página familiar dice que el teléfono no ha dado noticias. ¿Qué hago?",
  "Check the phone is switched on, plugged in, connected to the internet, and still showing the green \"Camera on\" sign. If not, open Phone camera again and press \"Start watching\".":
    "Compruebe que el teléfono está encendido, enchufado, conectado a internet y que sigue mostrando el aviso verde «Cámara encendida». Si no, vuelva a abrir Cámara del teléfono y pulse «Empezar a vigilar».",
  "I forgot my password.": "He olvidado mi contraseña.",
  "Use the": "Use el formulario para",
  "reset your password": "restablecer su contraseña",
  "form and we'll email you a link. Once you're signed in, you can change your password any time on":
    "y le enviaremos un enlace por correo. Cuando haya iniciado sesión, puede cambiar su contraseña cuando quiera en",
  ".": ".",
  "Is CareNest a medical device?": "¿CareNest es un aparato médico?",
  "No. It is a gentle helper so family can feel closer. It can miss things, so keep calling and visiting as usual.":
    "No. Es un ayudante discreto para que la familia se sienta más cerca. Puede que no note algunas cosas, así que siga llamando y visitando como siempre.",
  "Still stuck?": "¿Sigue teniendo problemas?",
  "Ask the family member who set up CareNest, or contact the CareNest team. We're happy to help.":
    "Pregunte al familiar que preparó CareNest o póngase en contacto con el equipo de CareNest. Le ayudaremos con mucho gusto.",
  "Go to the Family page": "Ir a la Página familiar",

  // ----- Your account page -----
  "Your *account*": "Su *cuenta*",
  "On a shared computer, log out when you are done.": "Si usa un ordenador compartido, cierre la sesión al terminar.",
  "Need help? Read how CareNest works": "¿Necesita ayuda? Lea cómo funciona CareNest",
  "Your name": "Su nombre",
  "The name your family will see.": "El nombre que verá su familia.",
  "We couldn't load your name. Please check your internet and reload.":
    "No pudimos cargar su nombre. Revise su conexión a internet y vuelva a cargar la página.",
  "Your name is saved.": "Su nombre se ha guardado.",
  "Saving…": "Guardando…",
  "Save name": "Guardar el nombre",
  "Please type a name, like Sam or Grandma Rose.": "Escriba un nombre, por ejemplo Sam o Abuela Rosa, por favor.",
  "Please keep your name under {n} letters.": "Su nombre debe tener menos de {n} letras, por favor.",
  "Change your password": "Cambiar su contraseña",
  "Current password": "Contraseña actual",
  "New password again": "Repita la contraseña nueva",
  "Please type your current password.": "Escriba su contraseña actual, por favor.",
  "The two new passwords don't match. Please type it again.":
    "Las dos contraseñas nuevas no coinciden. Vuelva a escribirla, por favor.",
  "That isn't your current password. Please try again.":
    "Esa no es su contraseña actual. Vuelva a intentarlo, por favor.",
  "Forgot your current password?": "¿Ha olvidado su contraseña actual?",
  "Your family circles": "Sus círculos familiares",
  "We couldn't load your family circles. Please check your internet and reload.":
    "No pudimos cargar sus círculos familiares. Revise su conexión a internet y vuelva a cargar la página.",
  "Care circle": "Círculo de cuidado",
  "Your home": "Su casa",
  "Family member": "Familiar",
  "Leaving a family circle isn't possible from this page yet. If you need to, please contact the CareNest team.":
    "Todavía no se puede salir de un círculo familiar desde esta página. Si lo necesita, póngase en contacto con el equipo de CareNest.",
};

export default es;
