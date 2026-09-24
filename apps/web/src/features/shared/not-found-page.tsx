import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/components/common/empty-state';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-12">
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        description="The page you are looking for does not exist, was moved, or you do not have access to it."
        action={
          <Button asChild variant="outline">
            <Link to="/">Go home</Link>
          </Button>
        }
        className="w-full max-w-lg"
      />
    </div>
  );
}
