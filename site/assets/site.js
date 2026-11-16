// Shared: footer year + optional email signup forms (data-signup)
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

document.querySelectorAll("form[data-signup]").forEach((form) => {
  const msg = form.querySelector(".form-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    const data = Object.fromEntries(new FormData(form).entries());
    data.source = form.dataset.signup;
    data.page = location.href;
    btn.disabled = true;
    msg.className = "form-msg";
    msg.textContent = "Sending...";
    try {
      const r = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong");
      msg.className = "form-msg ok";
      msg.textContent = "You're in. Check your inbox for the toolkit.";
      form.reset();
    } catch (err) {
      msg.className = "form-msg err";
      msg.textContent = err.message + ". You can still use the free tool right now.";
    } finally {
      btn.disabled = false;
    }
  });
});
