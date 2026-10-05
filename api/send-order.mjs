const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });

const esc = (s) =>
  String(s ?? "")
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

  // Brevo ne doit jamais bloquer la commande
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        `Brevo ${response.status}: ${
          data.message || data.code || "erreur inconnue"
        }`
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return json(
      {
        ok: false,
        error: "Méthode non autorisée"
      },
      405
    );
  }

  let body;

  try {
    body = await req.json();
  } catch {
    return json(
      {
        ok: false,
        error: "JSON invalide"
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
   * IMPORTANT :
   * À ce stade la commande est DÉJÀ enregistrée dans Supabase.
   * Cette fonction ne doit donc JAMAIS modifier ou supprimer la commande.
   */

  if (
    !name ||
    !email ||
    !address ||
    !city ||
    !Array.isArray(items) ||
    !items.length ||
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

  const apiKey = process.env.BREVO_API_KEY;
  const from = process.env.SHOP_FROM_EMAIL;
  const owner = process.env.SHOP_OWNER_EMAIL;

  if (!apiKey || !from || !owner) {
    return json({
      ok: false,
      error:
        "Configuration Brevo incomplète : vérifie BREVO_API_KEY, SHOP_FROM_EMAIL et SHOP_OWNER_EMAIL."
    });
  }

  const safeTotal = Number(total) || 0;

  const rows = items
    .map(
      (item) =>
        `<li>${esc(item.name)} — ${Number(item.qty) || 0} × ${(
          Number(item.unitPrice) || 0
        ).toFixed(2)} €</li>`
    )
    .join("");

  /*
   * Les deux emails partent EN PARALLÈLE.
   * Si l'un échoue, l'autre peut quand même partir.
   */

  const [adminResult, customerResult] =
    await Promise.allSettled([
      sendBrevo({
        apiKey,
        from,
        to: owner,
        replyTo: email,
        subject: `🍵 Nouvelle commande Schutz Tea — ${name}`,
        html: `
          <h2>🍵 Nouvelle commande</h2>

          <p>
            <b>ID commande :</b> ${esc(orderId)}
          </p>

          <p>
            <b>Client :</b> ${esc(name)}<br>
            <b>Pseudo :</b> ${esc(pseudo || "-")}<br>
            <b>Email :</b> ${esc(email)}<br>
            <b>Adresse :</b> ${esc(address)}, ${esc(city)}
          </p>

          <h3>Articles</h3>
          <ul>
            ${rows}
          </ul>

          <p>
            <b>Total : ${safeTotal.toFixed(2)} €</b>
          </p>

          ${
            note
              ? `<p><b>Note :</b> ${esc(note)}</p>`
              : ""
          }
        `
      }),

      sendBrevo({
        apiKey,
        from,
        to: email,
        subject: `🍵 Confirmation de ta commande Schutz Tea — ${orderId}`,
        html: `
          <h2>Commande enregistrée ✅</h2>

          <p>
            Bonjour ${esc(name)},
          </p>

          <p>
            Nous avons bien reçu ta commande.
          </p>

          <p>
            <b>Adresse de livraison :</b><br>
            ${esc(address)}, ${esc(city)}
          </p>

          <h3>Ta commande</h3>

          <ul>
            ${rows}
          </ul>

          <p>
            <b>Total : ${safeTotal.toFixed(2)} €</b>
          </p>

          <p>
            Ta commande est actuellement
            <b>en attente de traitement</b>.
          </p>

          <p>
            Tu recevras un nouvel email lorsque son statut changera.
          </p>

          <p>
            Merci pour ta commande 🍵
          </p>
        `
      })
    ]);

  const ownerSent =
    adminResult.status === "fulfilled";

  const customerSent =
    customerResult.status === "fulfilled";

  const errors = [];

  if (!ownerSent) {
    errors.push(
      "Email admin : " +
        (adminResult.reason?.message || "échec")
    );
  }

  if (!customerSent) {
    errors.push(
      "Email client : " +
        (customerResult.reason?.message || "échec")
    );
  }

  /*
   * Au moins un email est parti :
   * la commande reste évidemment valide.
   */
  if (ownerSent || customerSent) {
    return json({
      ok: true,
      ownerSent,
      customerSent,
      warning: errors.length
        ? errors.join(" | ")
        : null
    });
  }

  /*
   * Aucun email n'est parti.
   * MAIS la commande reste enregistrée.
   */
  return json({
    ok: false,
    error:
      "Commande enregistrée, mais aucun email Brevo n'a été envoyé. " +
      errors.join(" | ")
  });
}
