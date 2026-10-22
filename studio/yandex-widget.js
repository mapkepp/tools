"use strict";
(() => {
  const CLIENT_ID = "e5942ee8886149dfadc84fa3bc89049a";
  const CALLBACK = "https://mapkepp.github.io/tools/oauth/callback.html";
  const YANDEX_SDK = "https://yastatic.net/s3/passport-sdk/autofill/v1/sdk-suggest-with-polyfills-latest.js";
  const $ = id => document.getElementById(id);
  const btn = $("showYandexWidget");
  const status = $("yandexWidgetStatus");
  if (!btn || !status) return;
  let started = false;

  const message = text => { status.textContent = text; };
  function loadScript() {
    return new Promise((resolve, reject) => {
      if (typeof window.YaAuthSuggest?.init === "function") return resolve();
      const script = document.createElement("script");
      script.src = YANDEX_SDK;
      script.async = true;
      script.referrerPolicy = "no-referrer";
      script.onload = () =>
        typeof window.YaAuthSuggest?.init === "function" ?
        resolve() : reject(new Error("yandex_sdk_missing"));
      script.onerror = () => reject(new Error("yandex_sdk_unavailable"));
      document.head.appendChild(script);
    });
  }

  btn.addEventListener("click", async () => {
    if (started) return;
    started = true;
    btn.disabled = true;
    message("Загружаем официальную кнопку Яндекс ID…");
    try {
      await loadScript();
      // Personal button shows the account if Yandex cookies are available.
      // The login_hint / force_confirm fallback remains the normal OAuth link.
      const init = await window.YaAuthSuggest.init(
        {
          client_id: CLIENT_ID,
          response_type: "token",
          redirect_uri: CALLBACK,
          scope: "iot:view iot:control"
        },
        window.location.origin,
        {
          view: "button",
          parentId: "yandexButtonContainer",
          buttonView: "main",
          buttonTheme: "dark",
          buttonSize: "l",
          buttonBorderRadius: 10
        }
      );
      if (!init || init.status === "error" || typeof init.handler !== "function")
        throw new Error("yandex_widget_init_failed");
      message("Выберите аккаунт на кнопке Яндекс ID. Если он неверный, нажмите «Выбрать другой аккаунт» ниже.");
      const result = await init.handler();
      // Yandex SDK owns and validates the postMessage flow. Never print the result.
      const token = typeof result?.access_token === "string" ? result.access_token :
                    typeof result?.data?.access_token === "string" ? result.data.access_token : "";
      if (!/^[A-Za-z0-9_.~+\/=-]{12,4096}$/.test(token))
        throw new Error("missing_oauth_token");
      const input = $("oauthToken");
      if (!input) throw new Error("missing_token_field");
      input.value = token;
      input.type = "password";
      input.dispatchEvent(new Event("input", {bubbles:true}));
      message("Токен получен от Яндекса. Для проверки доступа нажмите «Загрузить мои устройства».");
      const check = $("tokenCheck");
      if (check) {
        check.textContent = "Токен получен через Яндекс ID. Он будет проверен при загрузке ваших устройств.";
        check.classList.remove("warning");
      }
    } catch {
      message("Персональная кнопка недоступна или вход отменён. Используйте обычную кнопку «Войти через Яндекс» ниже.");
    } finally {
      btn.disabled = false;
      started = false;
    }
  });
})();
