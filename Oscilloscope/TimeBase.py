class TimeBase:
    def __init__(self, time_base_dict):
        time_base_dict = {key.lower(): time_base_dict[key] for key in time_base_dict}
        self.scale = time_base_dict['scale']
        self.hoffset = time_base_dict['hoffset']
