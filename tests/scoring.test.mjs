import test from "node:test";
import assert from "node:assert/strict";
import { companyEmailCheck as c, leadGrade, networkType, emailParts } from "../site/app/scoring.js";

const cases = [
  ["john@acme.com", "Acme Corp", 1],
  ["daniel.menza@fennerppd.com", "Fenner", 0.9],
  ["x@frenchoil.com", "French Oil Mill Machinery Company", 0.9],
  ["x@acmeintl.com", "Acme International Group", 0.8],
  ["x@acmee.com", "Acme", 0.9],
  ["x@acmi.com", "Acme Inc", 0],
  ["x@parkaerospace.com", "Park Aerospace Corp", 1],
  ["x@abcmfg.com", "ABC Manufacturing", 0.8],
  ["x@eliteap.com", "ELITE ADVANCED POLYMERS", 0.75],
  ["x@precision-metaliks.com", "Precision Metaliks", 1],
  ["x@ibm.com", "International Business Machines", 0.75],
  ["acme@gmail.com", "Acme Corp", 0.7],
  ["bob123@gmail.com", "Acme Corp", 0],
  ["x@random.com", "Acme Corp", 0],
  ["x@mailinator.com", "Acme Corp", 0],
  ["x@acme.co.uk", "Acme Ltd", 1],
  ["x@mail.acme.com", "Acme", 1],
  ["x@johnsonandjohnson.com", "Johnson & Johnson", 1],
];

for (const [email, company, want] of cases) {
  test(`${email} vs ${company} -> ${want}`, () => {
    const r = c(email, company);
    assert.equal(r.score, want, r.reason);
  });
}

test("generic words alone don't match", () => {
  assert.ok(c("x@globaltech.com", "Global Tech Solutions").score >= 0.8); // full phrase still works
  assert.equal(c("x@tech.com", "Acme Tech").score, 0);
  assert.equal(c("x@solutions.com", "Bright Solutions").score, 0);
});

test("flags", () => {
  assert.equal(c("a@gmail.com", "X").isFreemail, true);
  assert.equal(c("a@yopmail.com", "X").isDisposable, true);
  assert.equal(c("a@acme.com", "Acme").isCorporate, true);
  assert.equal(c("not-an-email", "Acme").reason, "Invalid email format");
  assert.equal(emailParts("a@sub.example.com.au").core, "example");
});

test("network type", () => {
  assert.equal(networkType({ org: "AS16509 Amazon.com, Inc." }), "hosting");
  assert.equal(networkType({ org: "AS14061 DigitalOcean, LLC" }), "hosting");
  assert.equal(networkType({ org: "AS7922 Comcast Cable Communications, LLC" }), "isp");
  assert.equal(networkType({ org: "AS12345 French Oil Mill Machinery" }), "business");
  assert.equal(networkType({ privacy: { vpn: true } }), "anonymizer");
});

test("lead grades", () => {
  const ip = { country: "US", region: "Ohio", org: "AS7922 Comcast Cable Communications, LLC" };
  assert.equal(leadGrade({ email: "j@acme.com", company: "Acme", country: "US" }, ip).grade, "A");
  assert.equal(leadGrade({ email: "mike@gmail.com", company: "Northwind" }, ip).grade, "B");
  assert.equal(leadGrade({ email: "t@mailinator.com", company: "Fortune" }, { country: "DE", org: "AS24940 Hetzner Online GmbH" }).grade, "C");
  const mism = leadGrade({ email: "j@acme.com", company: "Acme", country: "United States" }, { country: "IN", org: "AS1 Some ISP broadband" });
  assert.ok(mism.reasons.some((r) => r.includes("form says")));
  assert.equal(leadGrade({ email: "j@acme.com", company: "Acme", country: "OH-not-country" }, ip).grade, "A");
});
