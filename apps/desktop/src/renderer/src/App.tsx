import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ZoomController } from "@/hooks/useZoom";
import NotFound from "./pages/NotFound.tsx";
import { ThemeProvider } from "@/components/theme-provider";
import AppShell from "@/features/app/AppShell";
import FloatingMascotPage from "@/features/panels/FloatingMascotPage";
import { RemoteFolderDialog } from "@/features/hosts/RemoteFolderDialog";

const queryClient = new QueryClient();
const AppRouter = typeof window !== "undefined" && "vibeAPI" in window ? HashRouter : BrowserRouter;

const App = () => (
  <ThemeProvider defaultMode="dark" defaultTheme="default" storageKey="politron-ui-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <RemoteFolderDialog />
        <ZoomController>
          <AppRouter>
            <Routes>
              <Route path="/" element={<AppShell />} />
              <Route path="/settings" element={<AppShell />} />
              <Route path="/mascot" element={<FloatingMascotPage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppRouter>
        </ZoomController>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
