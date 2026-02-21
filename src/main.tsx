import React from "react";
import ReactDOM from "react-dom/client";
import "leaflet/dist/leaflet.css";

import App from "./App";
import AdminApp from "./AdminApp";
import "./styles.css";

const isAdminRoute = window.location.pathname.startsWith("/admin");
document.title = isAdminRoute ? "PlaniFit Admin" : "PlaniFit";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isAdminRoute ? <AdminApp /> : <App />}
  </React.StrictMode>,
);
