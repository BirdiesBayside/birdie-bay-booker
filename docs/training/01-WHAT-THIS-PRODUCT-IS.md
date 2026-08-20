# 01 — What This Product Actually Is

## The business in one paragraph

An indoor golf venue has a handful of simulator bays. It sells time in those bays by the hour.
Customers book online, pay online, turn up — often when no staff are there — let themselves in,
and the bay is already powered on with the golf software running and their own settings loaded.
Some customers pay a monthly membership for cheaper rates. Some play in weekly leagues and
competitions. The venue also sells food and drinks to the bay.

The platform does all of that. It is a booking system, a payment system, a marketing system, a
league system, and a piece of building automation, in one.

## The five jobs the platform does

| Job | In plain terms |
| --- | --- |
| Sell bay time | Show what's free, take the booking, take the money |
| Let them in | Send a door code, open the gate during dark hours |
| Run the bay | Power the bay on before they arrive, launch the golf software, load their settings, warn them when time's nearly up, shut it down |
| Keep them coming back | Emails, SMS, credits, loyalty, memberships, leagues |
| Let staff run the venue | Admin hub: timetable, customers, pricing, reporting, point of sale |

## Who uses it

- **Customer** — books and plays. Web on any device, or the mobile app.
- **Staff/admin** — runs the venue from the admin hub.
- **The bay PC** — a Windows machine in each bay running the Bay Controller app, which acts on the
  schedule automatically with nobody present.

## The two front doors

The same codebase serves two domains:

- **Marketing + booking site** — the public venue website and the booking flow.
- **Hub** — the logged-in area: account, bookings, league, clubhouse, admin.

Which features show up depends on the domain the browser is on. See
`docs/platform/00-OVERVIEW.md`.

## Exercise

1. Visit the live venue site as a customer. Walk the whole booking flow up to the payment step
   (don't pay). Note every screen you pass through.
2. With the trainer, log into the admin hub and find: today's timetable, one customer's record,
   the pricing settings, and the bay controller logs.
3. Write, in your own words, a five-sentence description of what the product does. Give it to the
   trainer.

## Check yourself

- Why does the venue need the Bay Controller at all, rather than just leaving the bays on?
- What's the difference between the marketing site and the hub?
- Name three things a customer can do without any staff being present.

→ Next: [02 — How Lovable Builds Software](02-HOW-LOVABLE-BUILDS.md)
