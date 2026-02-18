class Sample:
    def __init__(self, sample_dict):
        sample_dict = {key.lower(): sample_dict[key] for key in sample_dict}
        self.fullscreen = sample_dict['fullscreen']
        self.slowmove = sample_dict['slowmove']
        self.datalen = sample_dict['datalen']
        self.samplerate = sample_dict['samplerate']
        self.type = sample_dict['type']
        self.depmem = sample_dict['depmem']
        self.precision = sample_dict['precision']
