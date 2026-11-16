// Shared: footer year + contact form (data-contact)
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

document.querySelectorAll("form[data-contact]").forEach((form) => {
  const msg = form.querySelector(".form-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form).entries());
    data.source = form.dataset.contact;
    btn.disabled = true;
    msg.className = "form-msg";
    msg.textContent = "Sending...";
    try {
      const r = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      msg.className = "form-msg ok";
      msg.textContent = "Thanks. Your message was sent and we'll reply by email.";
      form.reset();
    } catch (err) {
      msg.className = "form-msg err";
      msg.textContent = err.message + ". You can also email hello@soluniplabs.com.";
    } finally {
      btn.disabled = false;
    }
  });
});
