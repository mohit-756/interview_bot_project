import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Sidebar.css";

export default function Sidebar() {
  const { user } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname.startsWith(path);

  if (!user) return null;

  return (
    <aside className="sidebar">
      <nav className="sidebar-nav">
        {user.role === "hr" ? (
          <>
            <div className="nav-section">
              <p className="nav-label">HR Dashboard</p>
              <Link
                to="/hr"
                className={`nav-link ${isActive("/hr") && !isActive("/hr/candidates") && !isActive("/hr/interviews") && !isActive("/hr/jds") ? "active" : ""}`}
              >
                Dashboard
              </Link>
              <Link to="/hr/jds" className={`nav-link ${isActive("/hr/jds") ? "active" : ""}`}>
                JD Management
              </Link>
              <Link to="/hr/candidates" className={`nav-link ${isActive("/hr/candidates") ? "active" : ""}`}>
                Candidates
              </Link>
              <Link to="/hr/interviews" className={`nav-link ${isActive("/hr/interviews") ? "active" : ""}`}>
                Interviews
              </Link>
              <Link to="/hr/compare" className={`nav-link ${isActive("/hr/compare") ? "active" : ""}`}>
                Compare Candidates
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="nav-section">
              <p className="nav-label">Candidate</p>
              <Link to="/candidate" className={`nav-link ${isActive("/candidate") ? "active" : ""}`}>
                Dashboard
              </Link>
              <Link to="/candidate/practice" className={`nav-link ${isActive("/candidate/practice") ? "active" : ""}`}>
                Practice Interview
              </Link>
            </div>
          </>
        )}
      </nav>
    </aside>
  );
}
