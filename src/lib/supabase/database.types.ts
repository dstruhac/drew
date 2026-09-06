// Hand-written to match supabase/migrations/*.sql. Once the Supabase CLI is
// linked to the project, regenerate this file with:
//   supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type Sport = "hockey" | "football";
// "mixed" jen u Náhodné ligy -- zápasy pochází z různých lig, každý má
// vlastní `matches.sport` (viz níže), sport na competition slouží jen
// jako signál appce/sync-results, že jde o tenhle zvláštní případ.
export type CompetitionSport = Sport | "mixed";
export type CompetitionStatus = "active" | "archived";
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed";
export type CardRarity = "common" | "rare" | "legendary";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          badges_seen_through: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          badges_seen_through?: string;
        };
        Relationships: [];
      };
      competitions: {
        Row: {
          id: string;
          name: string;
          sport: CompetitionSport;
          status: CompetitionStatus;
          points_exact: number;
          points_winner: number;
          points_total_goals: number;
          scrape_source: string | null;
          scrape_path: string | null;
          logo_url: string | null;
          description: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sport: CompetitionSport;
          status?: CompetitionStatus;
          points_exact?: number;
          points_winner?: number;
          points_total_goals?: number;
          scrape_source?: string | null;
          scrape_path?: string | null;
          logo_url?: string | null;
          description?: string | null;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          sport?: CompetitionSport;
          status?: CompetitionStatus;
          points_exact?: number;
          points_winner?: number;
          points_total_goals?: number;
          scrape_source?: string | null;
          scrape_path?: string | null;
          logo_url?: string | null;
          description?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competitions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          id: string;
          competition_id: string;
          external_id: string | null;
          home_team: string;
          away_team: string;
          kickoff_at: string;
          status: MatchStatus;
          home_score: number | null;
          away_score: number | null;
          overtime_flag: boolean | null;
          // Jen u zápasů "mixed" competition (Náhodná liga) -- viz
          // migrace 20260830090000_random_league.sql. Jinak null a
          // appka použije competition.sport.
          sport: Sport | null;
          source_scrape_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          external_id?: string | null;
          home_team: string;
          away_team: string;
          kickoff_at: string;
          status?: MatchStatus;
          home_score?: number | null;
          away_score?: number | null;
          overtime_flag?: boolean | null;
          sport?: Sport | null;
          source_scrape_path?: string | null;
        };
        Update: {
          external_id?: string | null;
          home_team?: string;
          away_team?: string;
          kickoff_at?: string;
          status?: MatchStatus;
          home_score?: number | null;
          away_score?: number | null;
          overtime_flag?: boolean | null;
          sport?: Sport | null;
          source_scrape_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
        ];
      };
      predictions: {
        Row: {
          id: string;
          match_id: string;
          user_id: string;
          predicted_home_score: number;
          predicted_away_score: number;
          predicted_overtime_flag: boolean | null;
          is_locked: boolean;
          points: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          user_id: string;
          predicted_home_score: number;
          predicted_away_score: number;
          predicted_overtime_flag?: boolean | null;
        };
        Update: {
          predicted_home_score?: number;
          predicted_away_score?: number;
          predicted_overtime_flag?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "predictions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      competition_participants: {
        Row: {
          competition_id: string;
          user_id: string;
          joined_at: string;
          email_reminders_enabled: boolean;
        };
        Insert: {
          competition_id: string;
          user_id: string;
          email_reminders_enabled?: boolean;
        };
        Update: {
          email_reminders_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "competition_participants_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_badges: {
        Row: {
          competition_id: string;
          week_start: string;
          user_id: string;
          points: number;
          awarded_at: string;
        };
        Insert: {
          competition_id: string;
          week_start: string;
          user_id: string;
          points: number;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "weekly_badges_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_badges_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      team_logos: {
        Row: {
          competition_id: string;
          team_name: string;
          logo_url: string;
        };
        Insert: {
          competition_id: string;
          team_name: string;
          logo_url: string;
        };
        Update: {
          logo_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_logos_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
        ];
      };
      cards: {
        Row: {
          id: number;
          rarity: CardRarity;
          name: string;
          club: string;
          position: string;
          sport: Sport;
          flavor_text: string;
          image_url: string | null;
          created_at: string;
        };
        Insert: {
          id: number;
          rarity: CardRarity;
          name: string;
          club: string;
          position: string;
          sport: Sport;
          flavor_text: string;
          image_url?: string | null;
        };
        Update: {
          image_url?: string | null;
        };
        Relationships: [];
      };
      user_cards: {
        Row: {
          user_id: string;
          card_id: number;
          quantity: number;
          first_obtained_at: string;
        };
        Insert: {
          user_id: string;
          card_id: number;
          quantity?: number;
        };
        Update: {
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "user_cards_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_cards_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
        ];
      };
      card_draws: {
        Row: {
          user_id: string;
          week_start: string;
          card_id: number;
          rarity: CardRarity;
          win_count: number;
          awarded_at: string;
        };
        Insert: {
          user_id: string;
          week_start: string;
          card_id: number;
          rarity: CardRarity;
          win_count: number;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "card_draws_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "card_draws_card_id_fkey";
            columns: ["card_id"];
            isOneToOne: false;
            referencedRelation: "cards";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
