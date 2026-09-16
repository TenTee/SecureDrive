import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "../i18n.js";
import "./splash.css";

export default function Splash() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onLang = () => setTick((x) => x + 1);
    window.addEventListener("sd-lang-change", onLang);
    return () => window.removeEventListener("sd-lang-change", onLang);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return p + 4;
      });
    }, 40);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (progress >= 100) {
      const timer = setTimeout(() => navigate("/login"), 350);
      return () => clearTimeout(timer);
    }
  }, [progress, navigate]);

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-icon">
          <ShieldIcon />
        </div>
        <h1 className="splash-title">
          Secure<span>Drive</span>
        </h1>
        <p className="splash-subtitle">{t("splashSubtitle")}</p>

        <div className="splash-progress-track">
          <div className="splash-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="splash-status">
          {progress < 100 ? t("loadingSecure") : t("ready")}
        </p>
      </div>

      <button className="splash-skip" onClick={() => navigate("/login")}>
        {t("continueToLogin")}
      </button>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
    </svg>
  );
}