use anchor_lang::prelude::*;
use session_keys::{SessionError, SessionToken, session_auth_or, Session};


declare_id!("GFjNtpDgXbbKSH7WSpsZND57D2eSgZR7GhaLM7ANmMCW");
const COUNTER_SEED: &[u8] = b"counter";

#[program]
pub mod counter_session {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter: &mut Counter = &mut ctx.accounts.counter;
        counter.count = 0;
        counter.authority = *ctx.accounts.owner.key;
        Ok(())
    }

    #[session_auth_or(
        ctx.accounts.counter.authority.key() == ctx.accounts.signer.key(),
        SessionError::InvalidToken
    )]
    pub fn increment(ctx: Context<Increment>) -> Result<()> {
        let counter: &mut Counter = &mut ctx.accounts.counter;
        counter.count += 1;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init, 
        payer = owner, 
        space = Counter::INIT_SPACE + 8 , 
        seeds = [ COUNTER_SEED, owner.key().as_ref() ], bump
    )]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts, Session)]
pub struct Increment<'info> {
    #[account(
        mut, 
        seeds = [ COUNTER_SEED, counter.authority.key().as_ref() ], 
        bump
    )]
    pub counter: Account<'info, Counter>,    
    #[session(
        signer = signer,
        // The authority of the user account which created the counter
        authority = counter.authority.key() 
    )]
    pub session_token: Option<Account<'info, SessionToken>>,
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct Counter {
    pub authority: Pubkey,
    pub count: u64,
}