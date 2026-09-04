# Larrybash 2027 × ContactZero — Integration Notes

How the campaign website's **Campaign Line Contact Center** section connects to the
**ContactZero Console** (`https://contact.192-248-146-231.nip.io`) so that every
lead the site captures reaches the agents who call/WhatsApp/email constituents.

---

## 1. What ContactZero is (findings from inspection)

| Aspect | Finding |
|---|---|
| Product | **ContactZero Console** — an Angular single-page **agent** workspace (inbox, queues, KB, wrap outcomes, CRM-record embed) on a **Java/Spring Boot** backend (`/actuator/info` → artifact `contactzero`). |
| Channels | Omnichannel: **WhatsApp, SMS, voice, email, chat**, with queues, SLA timers and agent presence (Ready / Reserved / On-channel / Wrap / Away). |
| Locale | Ships **English, Nigerian Pidgin, Yoruba, Hausa, Igbo** — already Nigeria-aware, a natural fit for this campaign. |
| Multi-tenant | Yes — auth carries `X-Tenant-Id`; a login persists `{ tenantId, tenantName, role, bearer }`. Roles: `agent`, `admin`, `analyst`. |
| Auth | `Authorization: Bearer <token>` + `X-Tenant-Id`. Login is `POST <base>/…/auth/login` with `{ email, password, totp }`. XSRF via `X-XSRF-TOKEN`. |
| API exposure | **Every `/api/**` returns `401` until authenticated** (Spring Security). No public intake / webhook / widget / `config.json` is exposed. `/actuator/health` and `/actuator/info` are open. |
| ⚠ Current state | This deployment is a **DEMO build**: tenant "Acme Microfinance demo tenant"; `/api/v1/me` returns a hard-coded agent ("Amaka"); strings say *"Meta and mailbox are not live in this build"*, *"Paystack and VAT are not live"*, and only `/api/demo/*` endpoints (events/election/smm) are reachable. **There is no Larrybash tenant or real connector yet.** |

**Consequence:** integration must be **server-to-server**. The public website cannot
hold ContactZero secrets, and there is no unauthenticated endpoint for the browser to
post to. Our Express backend (which already captures OTP-verified volunteers) is the
correct place to forward leads from.

---

## 2. Integration architecture (implemented, disabled by default)

```
Visitor → website form → POST /api/volunteer (our Express + OTP)
        → stored in our DB (volunteers)
        → contactzero.pushContact()  ── server-to-server, Bearer + X-Tenant-Id ──▶  ContactZero  /api/v1/contacts
                                                                                    (agents work the lead in queues)
```

- **`server/contactzero.js`** — the adapter. Obtains a bearer (static token or
  service-account login, token cached), maps a volunteer → a ContactZero *contact*,
  and `POST`s it. Called **fire-and-forget** from `routes/volunteer.js` after a
  successful registration; it **never throws into the request** and **never blocks**
  the visitor's response.
- **Disabled by default.** With `CONTACTZERO_ENABLED` unset/false the adapter is a
  pure no-op (`{ synced:false, queued:true }`) — nothing leaves the server. Leads sit
  in our DB with `cz_synced=false`, ready to drain once credentials exist.
- All endpoints/paths/credentials are **environment variables** (`server/.env.example`,
  `CONTACTZERO_*`). Turning the integration on after deployment is a config change, not
  a code change.

---

## 3. What we need from the ContactZero API owner  ← action items

The adapter's request shape is a **best guess** from the client bundle and must be
confirmed. Please provide:

1. **A real campaign tenant** (not the Acme demo) and its **`tenantId`** for `X-Tenant-Id`.
2. **A service account** for machine-to-machine use — either
   (a) a long-lived **bearer/API token**, or (b) **email + password (+ TOTP)** and the
   exact **login path** and response JSON (which field holds the token + its TTL).
3. **The contact-intake endpoint**: exact method + path (we default `POST /api/v1/contacts`)
   and the **payload schema** — required/optional fields, how tags/attributes and
   ward/interest custom fields are represented, and the **success response** (where the
   new contact id is returned).
4. **De-duplication rule** — does ContactZero upsert on phone/email, or should we?
5. **(Optional) Interactions/tasks** — if a new lead should also create an interaction
   or a callback task in a queue, the endpoint + shape for that.
6. **(Optional) CRM embed** — ContactZero supports an embedded "CRM record" per tenant.
   If desired, we can expose a read-only volunteer-record URL for agents to see full
   context inside the console; tell us the embed contract.
7. **Allowed egress** — confirm the production website's server IP/domain may call the
   ContactZero API (any allow-listing / mTLS / network policy).

Once 1–3 are supplied: set the `CONTACTZERO_*` vars, `CONTACTZERO_ENABLED=true`,
run the `cz_synced`/`cz_ref` column migration (in `db/schema.sql`), and new
registrations flow through automatically. A small drain script/endpoint for the
backlog of `cz_synced=false` rows is the natural next step (not built yet, pending
the confirmed contract).

---

## 4. Field mapping (current default — confirm in item 3)

| Our volunteer field | ContactZero contact (assumed) |
|---|---|
| `full_name` | `displayName` |
| `phone_number` (E.164) | `phone` |
| `email` (optional) | `email` |
| `ward`, `interest_area` | `tags[]` + `attributes.{ward,interest_area}` |
| `phone_verified` | `attributes.phone_verified` |
| — | `source: "larrybash-2027-website"`, `preferredChannel: "whatsapp"`, `consent{...}` |
