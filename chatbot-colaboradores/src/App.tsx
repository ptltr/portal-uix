import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "./pages/Home";
import CapitalHumano from "./pages/CapitalHumano";
import NotFound from "./pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/portal-uix" component={Home} />
      <Route path="/portal-uix/" component={Home} />
      <Route path="/capital-humano" component={CapitalHumano} />
      <Route path="/capital-humano/" component={CapitalHumano} />
      <Route path="/portal-uix/capital-humano" component={CapitalHumano} />
      <Route path="/portal-uix/capital-humano/" component={CapitalHumano} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
