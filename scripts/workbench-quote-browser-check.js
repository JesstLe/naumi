// Run this expression with T3 preview_evaluate on the local fixture workbench.
(async () => {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(location.origin)) throw Error("local fixture only");
  const results = [], check = (ok, message) => { if (!ok) throw Error(message); };
  const alerts = [], oldAlert = window.alert, oldConfirm = window.confirm;
  window.alert = message => alerts.push(String(message)); window.confirm = () => true;
  const set = async scenario => { await fetch("/__fixture/scenario", { method: "POST", body: JSON.stringify({ scenario }) }); alerts.length = 0; };
  const stats = () => fetch("/__fixture/stats").then(r => r.json());
  const paid = ["workbench/start", "workbench/infer-prompts", "workbench/edit", "single/start", "chat-image/send", "chat-image/confirm"];
  try {
    for (const scenario of ["quote400", "quote500", "quoteHTML", "quoteBadJSON", "quoteNetwork"]) {
      await set(scenario); await submitWorkbenchJobs([{ ref_path: "asset-fixture-ref", prompt: "fixture" }]);
      const calls = (await stats()).calls;
      check((scenario === "quoteNetwork" ? calls.filter(c => c.path === "quote").length >= 1 : calls.filter(c => c.path === "quote").length === 1), scenario + " quote once");
      check(!calls.some(c => paid.includes(c.path)), scenario + " no acceptance POST");
      check(alerts.length === 1 && !/[{}<>]/.test(alerts[0]), scenario + " readable, not JSON/HTML");
      if (scenario === "quote400" || scenario === "quote500") check(alerts[0].includes("wb-1234567890abcdef"), "trace retained");
      results.push({ scenario, alert: alerts[0], acceptedPosts: 0, quoteRequests:calls.filter(c=>c.path==="quote").length });
    }
    for (const scenario of ["submitLost", "submit500", "submitHTML", "unknown", "rejected", "success"]) {
      await set(scenario);
      const response = await fetch("/api/reference-workbench/workbench/start", { method: "POST", body: JSON.stringify({ items: [{ ref_path: "asset-fixture-ref", prompt: "fixture" }], request_id: "fixture-original-request" }) });
      const data = await response.json(), calls = (await stats()).calls, accepts = calls.filter(c => c.path === "workbench/start"), receipts = calls.filter(c => c.path === "receipt");
      check(scenario === "submitLost" ? accepts.length >= 1 : accepts.length === 1, scenario + " one submission intent only");
      check(new Set(accepts.map(c=>JSON.stringify(c.body))).size === 1, "transport retries retain byte-equivalent request and quote IDs");
      check(accepts[0].body.request_id === "fixture-original-request", "original request ID retained");
      check(accepts[0].body.native_quote.id === "12345678-1234-4234-a234-123456789abc", "original quote ID retained");
      check(receipts.length === (scenario === "success" ? 0 : 1), scenario + " exact receipt lookup only");
      if (scenario === "unknown" || scenario === "rejected") { check(response.status === 409 && data.code === "SUBMISSION_UNKNOWN" && data.operationId === accepts[0].body.native_quote.id, "unknown stays unknown with original ID"); check(data.accepted !== false, "no false unaccepted claim"); }
      else check(response.ok && data.id === accepts[0].body.native_quote.id, scenario + " recovered same receipt");
      results.push({ scenario, status: response.status, uniqueSubmissionIntents: 1, httpPosts: accepts.length, receiptQueries: receipts.length, data });
    }
    await set("success"); window.confirm = () => false;
    const cancel = await fetch("/api/reference-workbench/workbench/start", { method: "POST", body: "{}" });
    check(cancel.status === 409 && !(await stats()).calls.some(c => paid.includes(c.path)), "cancel submits nothing");
    results.push({ scenario: "cancel", submissions: 0 });
    window.confirm = () => true;
    for (const action of paid) {
      await set("quote400"); const response = await fetch("/api/reference-workbench/" + action, { method: "POST", body: "{}" });
      check(response.status === 400 && !(await stats()).calls.some(c => paid.includes(c.path)), action + " stops on failed quote");
      results.push({ scenario: "all-entry-quote-failure", action, submissions: 0 });
    }
    await set("quote400");
    await runInferTask({ root: "fixture-project", selected: [{ ref_path: "asset-fixture-ref", prompt: "fixture" }] });
    check(alerts.length === 1 && !/[{}<>]/.test(alerts[0]), "inference error readable");
    results.push({ scenario: "infer-UI", alert: alerts[0] });
    return { pass: true, checks: results.length, productionCalls: 0, results };
  } finally { window.alert = oldAlert; window.confirm = oldConfirm; }
})()
