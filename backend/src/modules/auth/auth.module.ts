import { Global, Module } from '@nestjs/common';
import { SupabaseJwtVerifier } from './supabase-jwt.verifier';
import { UserResolverService } from './user-resolver.service';
import { SingleUserService } from './single-user.service';
import { SupabaseAuthGuard } from './supabase-auth.guard';

@Global()
@Module({
  providers: [SupabaseJwtVerifier, UserResolverService, SingleUserService, SupabaseAuthGuard],
  exports: [SupabaseJwtVerifier, UserResolverService, SingleUserService, SupabaseAuthGuard],
})
export class AuthModule {}
