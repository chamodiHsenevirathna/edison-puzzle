import { Link } from "react-router-dom";
import { EmptyState } from "../components/ui";
import { useDocumentTitle } from "../lib/hooks";

export function NotFound() {
  useDocumentTitle("Not found");
  return (
    <EmptyState
      title="Page not found"
      action={
        <Link className="btn" to="/">
          Back to the start
        </Link>
      }
    >
      There is nothing at this address.
    </EmptyState>
  );
}
