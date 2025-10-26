import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import { Home } from "./pages/Home";
import { Stream } from "./pages/Stream";
import { Chat } from "./pages/Chat";

function NavBar() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path
      ? "bg-blue-600 text-white"
      : "text-gray-300 hover:bg-gray-700 hover:text-white";
  };

  return (
    <nav className="bg-gray-800 shadow-lg w-full flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-2xl">⚡</span>
        <span className="text-xl font-bold text-white">Serverless SSE/WS</span>
      </div>
      <div className="flex gap-4">
        <Link
          to="/"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
            "/"
          )}`}
        >
          Home
        </Link>
        <Link
          to="/stream"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
            "/stream"
          )}`}
        >
          Stream (SSE)
        </Link>
        <Link
          to="/chat"
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${isActive(
            "/chat"
          )}`}
        >
          Chat (WS)
        </Link>
      </div>
    </nav>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <main className="container mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/stream" element={<Stream />} />
            <Route path="/chat" element={<Chat />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
