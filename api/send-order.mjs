const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

async function sendBrevo({
  apiKey,
  from,
  to,
  replyTo,
  subject,
  html
}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 8000);

  try {
    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",

        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "api-key": apiKey
        },

        body: JSON.stringify({
          sender: {
            email: from,
            name: "Schutz Tea"
          },

          to: [
            {
              email: to
            }
          ],

          ...(replyTo
            ? {
                replyTo: {
                  email: replyTo
                }
              }
            : {}),

          subject,

          htmlContent: html
        }),

        signal: controller.signal
      }
    );

    const raw = await response.text();

    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        raw
      };
    }

    if (!response.ok) {
      throw new Error(
        `BREVO_HTTP_${response.status}: ${
          data.message ||
          data.code ||
          data.raw ||
          "Brevo a refusé la requête."
        }`
      );
    }

    return {
      success: true,
      status: response.status,
      messageId: data.messageId || null
    };

  } catch (error) {

    if (error?.name === "AbortError") {
      throw new Error(
        "BREVO_TIMEOUT: Brevo n'a pas répondu dans les 8 secondes."
      );
    }

    throw error;

  } finally {
    clearTimeout(timeout);
  }
}


export default async function handler(req) {

  /*
   * ============================================================
   * 1. MÉTHODE
   * ============================================================
   */

  if (req.method !== "POST") {
    return json(
      {
        ok: false,
        error: "Méthode non autorisée."
      },
      405
    );
  }


  /*
   * ============================================================
   * 2. LECTURE DE LA COMMANDE
   * ============================================================
   */

  let body;

  try {
    body = await req.json();

  } catch {
    return json(
      {
        ok: false,
        error: "JSON invalide."
      },
      400
    );
  }


  const {
    name,
    email,
    address,
    city,
    note,
    items,
    total,
    pseudo,
    orderId
  } = body || {};


  /*
   * ============================================================
   * 3. VALIDATION
   * ============================================================
   */

  if (
    !name ||
    !email ||
    !address ||
    !city ||
    !Array.isArray(items) ||
    items.length === 0 ||
    !orderId
  ) {

    return json(
      {
        ok: false,
        error: "Commande incomplète."
      },
      400
    );
  }


  /*
   * ============================================================
   * 4. VARIABLES VERCEL
   * ============================================================
   */

  const apiKey = process.env.BREVO_API_KEY;

  const from = process.env.SHOP_FROM_EMAIL;

  const owner = process.env.SHOP_OWNER_EMAIL;


  /*
   * IMPORTANT :
   *
   * On vérifie uniquement les variables nécessaires à Brevo.
   *
   * SUPABASE_SERVICE_ROLE_KEY n'est volontairement PAS utilisée ici.
   *
   * La commande est déjà enregistrée avant l'appel de cette fonction.
   */

  const missing = [];

  if (!apiKey) {
    missing.push("BREVO_API_KEY");
  }

  if (!from) {
    missing.push("SHOP_FROM_EMAIL");
  }

  if (!owner) {
    missing.push("SHOP_OWNER_EMAIL");
  }


  if (missing.length > 0) {

    return json(
      {
        ok: false,

        error:
          "BREVO_CONFIGURATION_ERROR: variables manquantes : " +
          missing.join(", ")
      },
      200
    );
  }


  /*
   * ============================================================
   * 5. PRÉPARATION DU CONTENU
   * ============================================================
   */

  const safeTotal = Number(total) || 0;

  const rows = items
    .map((item) => {

      const itemName = esc(item?.name || "Article");

      const quantity = Number(item?.qty) || 0;

      const unitPrice =
        Number(item?.unitPrice) || 0;

      return `
        <li>
          ${itemName}
          — ${quantity} × ${unitPrice.toFixed(2)} €
        </li>
      `;
    })
    .join("");


  /*
   * ============================================================
   * 6. EMAIL ADMIN
   * ============================================================
   */

  const adminEmail = sendBrevo({

    apiKey,

    from,

    to: owner,

    replyTo: email,

    subject:
      `🍵 Nouvelle commande Schutz Tea — ${name}`,

    html: `
      <div style="font-family:Arial,sans-serif">

        <h2>🍵 Nouvelle commande</h2>

        <p>
          <strong>ID commande :</strong>
          ${esc(orderId)}
        </p>

        <hr>

        <p>
          <strong>Client :</strong>
          ${esc(name)}
        </p>

        <p>
          <strong>Pseudo :</strong>
          ${esc(pseudo || "-")}
        </p>

        <p>
          <strong>Email :</strong>
          ${esc(email)}
        </p>

        <p>
          <strong>Adresse :</strong><br>
          ${esc(address)}<br>
          ${esc(city)}
        </p>

        <h3>Articles</h3>

        <ul>
          ${rows}
        </ul>

        <p>
          <strong>Total :</strong>
          ${safeTotal.toFixed(2)} €
        </p>

        ${
          note
            ? `
              <p>
                <strong>Note :</strong>
                ${esc(note)}
              </p>
            `
            : ""
        }

      </div>
    `
  });


  /*
   * ============================================================
   * 7. EMAIL CLIENT
   * ============================================================
   */

  const customerEmail = sendBrevo({

    apiKey,

    from,

    to: email,

    subject:
      `🍵 Confirmation de ta commande Schutz Tea — ${orderId}`,

    html: `
      <div style="font-family:Arial,sans-serif">

        <h2>Commande enregistrée ✅</h2>

        <p>
          Bonjour ${esc(name)},
        </p>

        <p>
          Nous avons bien reçu ta commande.
        </p>

        <h3>Ta commande</h3>

        <ul>
          ${rows}
        </ul>

        <p>
          <strong>Total :</strong>
          ${safeTotal.toFixed(2)} €
        </p>

        <p>
          <strong>Adresse de livraison :</strong><br>
          ${esc(address)}<br>
          ${esc(city)}
        </p>

        <p>
          Ta commande est actuellement
          <strong>en attente de traitement</strong>.
        </p>

        <p>
          Tu recevras un nouvel email lorsque le statut de
          ta commande changera.
        </p>

        <p>
          Merci pour ta commande 🍵
        </p>

      </div>
    `
  });


  /*
   * ============================================================
   * 8. ENVOI DES DEUX EMAILS EN PARALLÈLE
   * ============================================================
   */

  const results = await Promise.allSettled([
    adminEmail,
    customerEmail
  ]);


  const adminResult = results[0];

  const customerResult = results[1];


  const adminSent =
    adminResult.status === "fulfilled";

  const customerSent =
    customerResult.status === "fulfilled";


  /*
   * ============================================================
   * 9. ERREURS DÉTAILLÉES
   * ============================================================
   */

  const errors = [];


  if (!adminSent) {

    errors.push(
      "ADMIN: " +
      (
        adminResult.reason?.message ||
        "erreur inconnue"
      )
    );
  }


  if (!customerSent) {

    errors.push(
      "CLIENT: " +
      (
        customerResult.reason?.message ||
        "erreur inconnue"
      )
    );
  }


  /*
   * ============================================================
   * 10. AU MOINS UN EMAIL EST PARTI
   * ============================================================
   */

  if (adminSent || customerSent) {

    return json({

      ok: true,

      orderSaved: true,

      adminSent,

      customerSent,

      adminMessageId:
        adminSent
          ? adminResult.value?.messageId || null
          : null,

      customerMessageId:
        customerSent
          ? customerResult.value?.messageId || null
          : null,

      warning:
        errors.length > 0
          ? errors.join(" | ")
          : null
    });
  }


  /*
   * ============================================================
   * 11. AUCUN EMAIL
   *
   * LA COMMANDE RESTE QUAND MÊME VALIDÉE.
   * ============================================================
   */

  return json({

    ok: false,

    orderSaved: true,

    error:
      "BREVO_SEND_ERROR: aucun email n'a été envoyé. " +
      errors.join(" | ")
  });
}
