-- Add custom_segment column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_segment TEXT;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profiles_custom_segment ON public.profiles(custom_segment);

-- Tag all customers as "hub_launch_missed" EXCEPT the 52 who already received the email
UPDATE public.profiles
SET custom_segment = 'hub_launch_missed'
WHERE email IS NOT NULL
  AND email NOT IN (
    'merton123@gmail.com',
    'pjdavies234@gmail.com',
    'charliefoxtrotsandmanalpha@gmail.com',
    'kuftireff8@gmail.com',
    'coach.billy@hotmail.com',
    'tyeslade2@gmail.com',
    'eliza.kinder2786@gmail.com',
    'jeremy@reedify.com.au',
    'byronjhumble@icloud.com',
    'jessicalily97@gmail.com',
    'ben.winks1@gmail.com',
    'golfbmm@outlook.com',
    'bella.jane270902@gmail.com',
    'admin@eastonelectricalqld.com',
    'a.barnes777@hotmail.com',
    'steve.allan@freedomproperty.com.au',
    'danielkrabbe94@gmail.com',
    'readj18@gmail.com',
    'ben@richmondcontracting.com.au',
    'ddarcy80@gmail.com',
    'zachary_ellison@hotmail.com',
    'nichollsreece7@gmail.com',
    'russell.glyde@outlook.com',
    'darren.nobile@gmail.com',
    'tim@adviceops.com.au',
    'rgees05@outlook.com',
    'organmd11@gmail.com',
    'calebmontgomery81@yahoo.com',
    'cknyn@icloud.com',
    'ryan@rgmedia.com.au',
    'rizla65@icloud.com',
    'lliamhollandd@gmail.com',
    'tomgreen262727@gmail.com',
    'diggers-89@hotmail.com',
    'mark.venter88@gmail.com',
    'brandonmabb93@gmail.com',
    'lauraexcell91@gmail.com',
    'rodvrolyks@gmail.com',
    'christopherrae87@gmail.com',
    'makaylalayther02@gmail.com',
    'wdsmith105@gmail.com',
    'bryanaimhoff@gmail.com',
    'kyleneumann98@gmail.com',
    'r.xlb23@outlook.com',
    'sandra@auscare.com',
    'clemenssteenkamp0513@gmail.com',
    'tobyabraham147@gmail.com',
    'ndolby24@gmail.com',
    'clarknegan17@gmail.com',
    'samuel.crosso@gmail.com',
    'taylordevelopments20@gmail.com',
    'corydavis@outlook.com.au'
  );