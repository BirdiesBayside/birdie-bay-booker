import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Phone, Mail, MapPin } from "lucide-react";

const HERO = "https://birdiesbayside.com.au/cdn/shop/files/Birdies_Golf.jpg?v=1751956878&width=3840";
const MAP_IMG = "https://birdiesbayside.com.au/cdn/shop/files/WE_ARE_HERE.png?v=1755590019&width=3840";

const MarketingContact = () => (
  <MarketingLayout>
    <section className="relative h-[34vh] min-h-[220px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-accent font-display tracking-[0.25em] uppercase text-xs mb-1.5">Get in Touch</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">Contact Us</h1>
      </div>
    </section>

    <section className="py-20">
      <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 max-w-6xl">
        {/* Contact details */}
        <div>
          <h2 className="font-display text-3xl text-primary mb-6">Reach out anytime</h2>
          <p className="text-foreground/80 mb-8 leading-relaxed">
            Got a question, want to plan a function, or need help with a booking? Drop us a line , we usually reply within a few hours.
          </p>
          <div className="space-y-5">
            <ContactRow icon={Phone} label="Phone" value="(07) 2146 8442" href="tel:0721468442" />
            <ContactRow icon={Mail} label="Email" value="info@birdiesbayside.com.au" href="mailto:info@birdiesbayside.com.au" />
            <ContactRow icon={MapPin} label="Address" value="Unit 2, 86 Jardine Drive, Redland Bay QLD 4165" />
          </div>

          <div className="mt-10 rounded-xl overflow-hidden border border-border">
            <img src={MAP_IMG} alt="Birdies location map" className="w-full h-auto" />
          </div>
        </div>

        {/* Contact form */}
        <ContactForm />
      </div>
    </section>
  </MarketingLayout>
);

const ContactRow = ({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
}) => (
  <div className="flex gap-4 items-start">
    <div className="w-11 h-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="text-xs uppercase tracking-wider text-foreground/60">{label}</p>
      {href ? (
        <a href={href} className="font-display text-lg text-primary hover:text-accent transition-colors">{value}</a>
      ) : (
        <p className="font-display text-lg text-primary">{value}</p>
      )}
    </div>
  </div>
);

const ContactForm = () => {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const subject = encodeURIComponent(`Website enquiry from ${data.get("name")}`);
    const body = encodeURIComponent(
      `Name: ${data.get("name")}\nEmail: ${data.get("email")}\nPhone: ${data.get("phone")}\n\n${data.get("message")}`
    );
    window.location.href = `mailto:info@birdiesbayside.com.au?subject=${subject}&body=${body}`;
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-2xl p-8 space-y-4 shadow-sm h-fit"
    >
      <h2 className="font-display text-3xl text-primary mb-2">Send us a message</h2>
      <Field name="name" label="Name" required />
      <Field name="email" label="Email" type="email" required />
      <Field name="phone" label="Phone" type="tel" />
      <div>
        <label className="block text-xs uppercase tracking-wider text-foreground/60 mb-1.5">Message</label>
        <textarea
          name="message"
          rows={5}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <button
        type="submit"
        className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-5 py-3 rounded-md"
      >
        Submit
      </button>
    </form>
  );
};

const Field = ({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) => (
  <div>
    <label className="block text-xs uppercase tracking-wider text-foreground/60 mb-1.5">{label}</label>
    <input
      name={name}
      type={type}
      required={required}
      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
    />
  </div>
);

export default MarketingContact;
