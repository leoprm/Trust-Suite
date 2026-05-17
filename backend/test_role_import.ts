// Quick test: does roleRoutes resolve correctly?
import roleRoutes from './src/routes/roleRoutes';
console.log('ROLE ROUTES TYPE:', typeof roleRoutes);
const stack = roleRoutes?.stack?.map((s: any) => s?.route?.path);
console.log('STACK:', JSON.stringify(stack));
