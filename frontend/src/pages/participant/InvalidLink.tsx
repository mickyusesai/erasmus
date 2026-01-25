import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';

export default function InvalidLink() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="py-12 text-center">
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-500 max-w-sm mx-auto">
            This magic link is invalid, has expired, or has been deactivated.
            Please contact the project organizers for a new link.
          </p>
          <div className="mt-8 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm text-gray-600">
              If you believe this is an error, please make sure you're using the complete link from your email.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
